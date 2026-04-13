/**
 * Cliente Supabase "fake" — backed por SQLite via better-sqlite3.
 *
 * Implementa o subconjunto da API Supabase usado neste projeto:
 *   supabase.from(table).select/insert/update/delete/upsert + filtros + single/maybeSingle
 *   supabase.rpc(name, params)
 *   supabase.auth.getUser()
 *
 * Só é instanciado quando LOCAL_DB=sqlite.
 */

import type Database from 'better-sqlite3'
import { getLocalDb, LOCAL_CLINIC_ID, LOCAL_USER_ID, deserializeRow, serializeRow } from './sqlite'

// ─── Tipos mínimos ────────────────────────────────────────────────────────────

type DbResult<T = unknown> = Promise<{ data: T | null; error: { message: string; code?: string } | null }>

const TABLE_COLUMNS_CACHE = new Map<string, Set<string>>()

// ─── Query Builder ────────────────────────────────────────────────────────────

class LocalQueryBuilder {
  private _table: string
  private _operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private _selectFields = '*'
  private _conditions: string[] = []
  private _params: unknown[] = []
  private _orderClauses: string[] = []
  private _insertData: Record<string, unknown> | null = null
  private _upsertData: Record<string, unknown> | null = null
  private _upsertOnConflict: string[] = []
  private _updateData: Record<string, unknown> | null = null
  private _isSingle = false
  private _isMaybeSingle = false
  private _limit: number | null = null
  private _selectAfterWrite = false

  constructor(private db: Database.Database, table: string) {
    this._table = table
  }

  // ── Projeção ────────────────────────────────────────────────────────────────

  select(fields = '*') {
    if (this._operation === 'insert' || this._operation === 'update') {
      this._selectAfterWrite = true
      return this
    }
    this._selectFields = this._simplifyFields(fields)
    return this
  }

  /** Remove relações Supabase do tipo "rel:table(fields)" — não suportadas localmente. */
  private _simplifyFields(fields: string): string {
    if (fields === '*') return '*'
    const parts = fields.split(',').map(f => f.trim()).filter(Boolean)
    // Se '*' for um dos campos, basta retornar '*'
    if (parts.some(f => f === '*')) return '*'
    // Remove campos relacionais e fragmentos de parênteses (ex: ")" solto)
    const simple = parts.filter(
      f => !f.includes(':') && !f.includes('(') && !f.includes(')'),
    )
    return simple.length > 0 ? simple.join(', ') : '*'
  }

  // ── Operações de escrita ────────────────────────────────────────────────────

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this._operation = 'insert'
    this._insertData = Array.isArray(data) ? data[0] : data
    return this
  }

  upsert(
    data: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict?: string } = {},
  ) {
    this._operation = 'upsert'
    this._upsertData = Array.isArray(data) ? data[0] : data
    this._upsertOnConflict = (options.onConflict || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
    return this
  }

  update(data: Record<string, unknown>) {
    this._operation = 'update'
    this._updateData = data
    return this
  }

  delete() {
    this._operation = 'delete'
    return this
  }

  // ── Filtros ─────────────────────────────────────────────────────────────────

  /** Converte booleanos em 0/1 — SQLite não aceita true/false como parâmetro. */
  private _p(value: unknown): unknown {
    return typeof value === 'boolean' ? (value ? 1 : 0) : value
  }

  eq(field: string, value: unknown) {
    this._conditions.push(`${field} = ?`)
    this._params.push(this._p(value))
    return this
  }

  neq(field: string, value: unknown) {
    this._conditions.push(`${field} != ?`)
    this._params.push(this._p(value))
    return this
  }

  gte(field: string, value: unknown) {
    this._conditions.push(`${field} >= ?`)
    this._params.push(this._p(value))
    return this
  }

  lte(field: string, value: unknown) {
    this._conditions.push(`${field} <= ?`)
    this._params.push(this._p(value))
    return this
  }

  gt(field: string, value: unknown) {
    this._conditions.push(`${field} > ?`)
    this._params.push(this._p(value))
    return this
  }

  lt(field: string, value: unknown) {
    this._conditions.push(`${field} < ?`)
    this._params.push(this._p(value))
    return this
  }

  in(field: string, values: unknown[]) {
    if (!values || values.length === 0) {
      this._conditions.push('1 = 0') // nunca retorna nada
      return this
    }
    const placeholders = values.map(() => '?').join(', ')
    this._conditions.push(`${field} IN (${placeholders})`)
    this._params.push(...values)
    return this
  }

  /**
   * not('field', 'gte', value) → field < value
   * not('field', 'lte', value) → field > value
   * not('field', 'eq',  value) → field != value
   */
  not(field: string, op: string, value: unknown) {
    const opMap: Record<string, string> = {
      gte: '<',
      lte: '>',
      gt: '<=',
      lt: '>=',
      eq: '!=',
    }
    const sqlOp = opMap[op]
    if (sqlOp) {
      this._conditions.push(`${field} ${sqlOp} ?`)
      this._params.push(value)
    }
    return this
  }

  /**
   * is('field', null)  → field IS NULL
   * is('field', true)  → field = 1
   */
  is(field: string, value: unknown) {
    if (value === null) {
      this._conditions.push(`${field} IS NULL`)
    } else if (value === true) {
      this._conditions.push(`${field} = 1`)
    } else if (value === false) {
      this._conditions.push(`${field} = 0`)
    }
    return this
  }

  /**
   * or('patient_name.ilike.%q%,patient_phone.ilike.%q%')
   * or('professional_id.is.null,professional_id.eq.abc')
   */
  or(conditions: string) {
    const parts = conditions.split(',').map(c => c.trim())
    const sqlParts: string[] = []
    for (const part of parts) {
      const dotIdx = part.indexOf('.')
      if (dotIdx === -1) continue
      const field = part.substring(0, dotIdx)
      const rest  = part.substring(dotIdx + 1)
      const opIdx = rest.indexOf('.')
      if (opIdx === -1) continue
      const op    = rest.substring(0, opIdx)
      const value = rest.substring(opIdx + 1)

      if (op === 'ilike') {
        sqlParts.push(`LOWER(${field}) LIKE LOWER(?)`)
        this._params.push(value)
      } else if (op === 'eq') {
        sqlParts.push(`${field} = ?`)
        this._params.push(value)
      } else if (op === 'is' && value === 'null') {
        sqlParts.push(`${field} IS NULL`)
      } else if (op === 'neq') {
        sqlParts.push(`${field} != ?`)
        this._params.push(value)
      }
    }
    if (sqlParts.length > 0) {
      this._conditions.push(`(${sqlParts.join(' OR ')})`)
    }
    return this
  }

  // ── Ordenação / Limite ──────────────────────────────────────────────────────

  order(field: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const dir   = options.ascending === false ? 'DESC' : 'ASC'
    const nulls = options.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST'
    this._orderClauses.push(`${field} ${dir} ${nulls}`)
    return this
  }

  limit(n: number) {
    this._limit = n
    return this
  }

  // ── Finalização ─────────────────────────────────────────────────────────────

  single(): DbResult {
    this._isSingle = true
    this._limit    = 1
    return this._execute()
  }

  maybeSingle(): DbResult {
    this._isMaybeSingle = true
    this._limit         = 1
    return this._execute()
  }

  then(
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return this._execute().then(resolve, reject)
  }

  // ── Execução SQL ─────────────────────────────────────────────────────────────

  private _execute(): DbResult {
    try {
      if (this._operation === 'select') {
        return Promise.resolve(this._runSelect())
      }
      if (this._operation === 'insert') {
        return Promise.resolve(this._runInsert())
      }
      if (this._operation === 'update') {
        return Promise.resolve(this._runUpdate())
      }
      if (this._operation === 'upsert') {
        return Promise.resolve(this._runUpsert())
      }
      if (this._operation === 'delete') {
        return Promise.resolve(this._runDelete())
      }
      return Promise.resolve({ data: null, error: null })
    } catch (err) {
      console.error(`[LocalDB] ${this._operation} ${this._table}:`, err)
      return Promise.resolve({
        data: null,
        error: { message: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  private _where() {
    return this._conditions.length > 0
      ? ` WHERE ${this._conditions.join(' AND ')}`
      : ''
  }

  private _getTableColumns(table: string): Set<string> {
    const cached = TABLE_COLUMNS_CACHE.get(table)
    if (cached) return cached

    const rows = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>
    const cols = new Set(rows.map(r => r.name))
    TABLE_COLUMNS_CACHE.set(table, cols)
    return cols
  }

  private _runSelect() {
    let sql = `SELECT ${this._selectFields} FROM ${this._table}${this._where()}`
    if (this._orderClauses.length > 0) sql += ` ORDER BY ${this._orderClauses.join(', ')}`
    if (this._limit !== null) sql += ` LIMIT ${this._limit}`

    const rows = (this.db.prepare(sql).all(this._params) as Record<string, unknown>[]).map(
      deserializeRow,
    )

    if (this._isSingle) {
      if (rows.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'Row not found' } }
      }
      return { data: rows[0], error: null }
    }
    if (this._isMaybeSingle) {
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null }
  }

  private _runInsert() {
    const raw = { ...this._insertData! }
    if (!raw.id) raw.id = crypto.randomUUID()

    // Alguns pontos do app ainda usam `message` no log; no SQLite local
    // normalizamos para `metadata.message` para evitar erro de coluna inexistente.
    if (this._table === 'logs' && raw.message != null) {
      const message = String(raw.message)
      delete raw.message

      const metadata =
        raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
          ? { ...(raw.metadata as Record<string, unknown>) }
          : {}

      if (metadata.message == null) metadata.message = message
      raw.metadata = metadata
    }

    const columns = this._getTableColumns(this._table)
    const now = new Date().toISOString()

    if (columns.has('created_at') && raw.created_at == null) raw.created_at = now
    if (columns.has('updated_at') && raw.updated_at == null) raw.updated_at = now

    const filteredRaw = Object.fromEntries(
      Object.entries(raw).filter(([key]) => columns.has(key)),
    )

    const data = serializeRow(filteredRaw)
    const keys  = Object.keys(data)
    const ph    = keys.map(() => '?').join(', ')
    const sql   = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${ph})`

    this.db.prepare(sql).run(Object.values(data))

    if (this._selectAfterWrite || this._isSingle || this._isMaybeSingle) {
      const insertedId = (filteredRaw.id ?? raw.id) as string | undefined
      if (!insertedId) return { data: filteredRaw, error: null }
      const row = this.db
        .prepare(`SELECT * FROM ${this._table} WHERE id = ?`)
        .get([insertedId]) as Record<string, unknown> | undefined
      return { data: row ? deserializeRow(row) : filteredRaw, error: null }
    }
    return { data: null, error: null }
  }

  private _runUpdate() {
    const data = serializeRow(this._updateData!)
    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ')
    const sql  = `UPDATE ${this._table} SET ${sets}${this._where()}`
    this.db.prepare(sql).run([...Object.values(data), ...this._params])

    if (this._selectAfterWrite || this._isSingle || this._isMaybeSingle) {
      const selSql = `SELECT * FROM ${this._table}${this._where()} LIMIT 1`
      const row = this.db.prepare(selSql).get(this._params) as Record<string, unknown> | undefined
      return { data: row ? deserializeRow(row) : null, error: null }
    }
    return { data: null, error: null }
  }

  private _runDelete() {
    this.db.prepare(`DELETE FROM ${this._table}${this._where()}`).run(this._params)
    return { data: null, error: null }
  }

  private _runUpsert() {
    const raw = { ...this._upsertData! }
    if (!raw.id) raw.id = crypto.randomUUID()

    const columns = this._getTableColumns(this._table)
    const now = new Date().toISOString()

    if (columns.has('created_at') && raw.created_at == null) raw.created_at = now
    if (columns.has('updated_at') && raw.updated_at == null) raw.updated_at = now

    const filteredRaw = Object.fromEntries(
      Object.entries(raw).filter(([key]) => columns.has(key)),
    )

    const data = serializeRow(filteredRaw)
    const keys = Object.keys(data)
    const placeholders = keys.map(() => '?').join(', ')

    let conflictColumns = this._upsertOnConflict.filter(col => columns.has(col))
    if (conflictColumns.length === 0) {
      if (keys.includes('id')) {
        conflictColumns = ['id']
      } else {
        return {
          data: null,
          error: { message: 'Upsert requires onConflict (or an id column)' },
        }
      }
    }

    const updateColumns = keys.filter(k => !conflictColumns.includes(k))
    const updateClause =
      updateColumns.length > 0
        ? updateColumns.map(k => `${k} = excluded.${k}`).join(', ')
        : `${conflictColumns[0]} = excluded.${conflictColumns[0]}`

    const sql = `
      INSERT INTO ${this._table} (${keys.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE
      SET ${updateClause}
    `

    this.db.prepare(sql).run(Object.values(data))

    if (this._selectAfterWrite || this._isSingle || this._isMaybeSingle) {
      const whereColumns = conflictColumns.every(col => filteredRaw[col] != null)
        ? conflictColumns
        : (filteredRaw.id != null ? ['id'] : conflictColumns)
      const whereClause = whereColumns.map(col => `${col} = ?`).join(' AND ')
      const whereValues = whereColumns.map(col => serializeRow({ [col]: filteredRaw[col] })[col])
      const row = this.db
        .prepare(`SELECT * FROM ${this._table} WHERE ${whereClause} LIMIT 1`)
        .get(whereValues) as Record<string, unknown> | undefined
      return { data: row ? deserializeRow(row) : filteredRaw, error: null }
    }

    return { data: null, error: null }
  }
}

// ─── Auth mock ────────────────────────────────────────────────────────────────

const LOCAL_USER = {
  id: LOCAL_USER_ID,
  email: 'local@local.dev',
  user_metadata: { full_name: 'Usuário Local', clinic_name: 'Minha Clínica Local' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

const localAuth = {
  async getUser() {
    return { data: { user: LOCAL_USER }, error: null }
  },
  async getSession() {
    return { data: { session: { user: LOCAL_USER } }, error: null }
  },
  async signOut() {
    return { error: null }
  },
}

// ─── RPC ──────────────────────────────────────────────────────────────────────

function localRpc(db: Database.Database, fn: string, params: Record<string, unknown>) {
  if (fn === 'get_or_create_bot_settings') {
    const clinicId = params.p_clinic_id as string
    const now      = new Date().toISOString()

    let row = db
      .prepare('SELECT * FROM bot_settings WHERE clinic_id = ?')
      .get([clinicId]) as Record<string, unknown> | undefined

    if (!row) {
      const defaultWH = JSON.stringify({
        timezone: 'America/Sao_Paulo',
        days: [
          { day: 'mon', enabled: true,  start: '08:00', end: '18:00' },
          { day: 'tue', enabled: true,  start: '08:00', end: '18:00' },
          { day: 'wed', enabled: true,  start: '08:00', end: '18:00' },
          { day: 'thu', enabled: true,  start: '08:00', end: '18:00' },
          { day: 'fri', enabled: true,  start: '08:00', end: '18:00' },
          { day: 'sat', enabled: false, start: '08:00', end: '12:00' },
          { day: 'sun', enabled: false, start: '08:00', end: '12:00' },
        ],
      })
      db.prepare(`
        INSERT INTO bot_settings
          (id, clinic_id, working_hours, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), clinicId, defaultWH, now, now)

      row = db
        .prepare('SELECT * FROM bot_settings WHERE clinic_id = ?')
        .get([clinicId]) as Record<string, unknown>
    }

    // Wrap em um thenable para compatibilidade com .rpc().single()
    const result = { data: row ? deserializeRow(row) : null, error: null }
    return {
      single: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => unknown, reject?: (r: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
  }

  // RPC desconhecido — retorna vazio
  return {
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Cria um cliente "Supabase" que usa SQLite em vez de chamar a API remota.
 */
export function createLocalClient() {
  const db = getLocalDb()

  return {
    auth: localAuth,

    from(table: string) {
      return new LocalQueryBuilder(db, table)
    },

    rpc(fn: string, params: Record<string, unknown> = {}) {
      return localRpc(db, fn, params)
    },
  }
}
