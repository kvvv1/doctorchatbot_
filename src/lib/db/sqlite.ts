/**
 * SQLite local database — ativo apenas quando LOCAL_DB=sqlite.
 *
 * Cria o arquivo local.db na raiz do projeto, roda as migrations
 * e faz seed de uma clínica/usuário padrão para desenvolvimento local.
 */

import Database from 'better-sqlite3'
import path from 'path'

export const LOCAL_CLINIC_ID = 'local-clinic-00000000-0000-0000-0000-000000000001'
export const LOCAL_USER_ID   = 'local-user-00000000-0000-0000-0000-000000000001'

let _db: Database.Database | null = null

export function getLocalDb(): Database.Database {
  if (_db) return _db

  const dbPath = path.join(process.cwd(), 'local.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  runMigrations(_db)
  seedDefaults(_db)

  return _db
}

// ─── Schema ──────────────────────────────────────────────────────────────────

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinics (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      email                TEXT,
      plan                 TEXT DEFAULT 'profissional',
      subscription_status  TEXT DEFAULT 'active',
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id         TEXT PRIMARY KEY,
      user_id    TEXT,
      clinic_id  TEXT NOT NULL,
      role       TEXT DEFAULT 'admin',
      email      TEXT,
      full_name  TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id                       TEXT PRIMARY KEY,
      clinic_id                TEXT NOT NULL,
      patient_phone            TEXT NOT NULL,
      patient_name             TEXT,
      status                   TEXT DEFAULT 'new',
      bot_enabled              INTEGER DEFAULT 1,
      bot_state                TEXT DEFAULT 'menu',
      bot_context              TEXT DEFAULT '{}',
      notes                    TEXT,
      last_message_at          TEXT,
      last_message_preview     TEXT,
      last_patient_message_at  TEXT,
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id               TEXT PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      sender           TEXT NOT NULL,
      content          TEXT NOT NULL,
      zapi_message_id  TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id                    TEXT PRIMARY KEY,
      clinic_id             TEXT NOT NULL,
      conversation_id       TEXT,
      patient_phone         TEXT NOT NULL,
      patient_name          TEXT NOT NULL,
      starts_at             TEXT NOT NULL,
      ends_at               TEXT NOT NULL,
      status                TEXT DEFAULT 'scheduled',
      description           TEXT,
      origin                TEXT DEFAULT 'manual_doctorchat',
      provider              TEXT DEFAULT 'manual',
      provider_reference_id TEXT,
      professional_id       TEXT,
      resource_id           TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointment_settings (
      id                       TEXT PRIMARY KEY,
      clinic_id                TEXT NOT NULL UNIQUE,
      default_duration_minutes INTEGER DEFAULT 30,
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      id                          TEXT PRIMARY KEY,
      clinic_id                   TEXT NOT NULL UNIQUE,
      bot_default_enabled         INTEGER DEFAULT 1,
      working_hours_enabled       INTEGER DEFAULT 0,
      working_hours               TEXT DEFAULT '{}',
      message_welcome             TEXT DEFAULT 'Olá! Bem-vindo à nossa clínica.',
      message_menu                TEXT DEFAULT 'Como posso ajudar?\n1. Agendar\n2. Ver agendamentos\n3. Cancelar\n4. Atendente',
      message_out_of_hours        TEXT DEFAULT 'Estamos fora do horário de atendimento.',
      message_fallback            TEXT DEFAULT 'Desculpe, não entendi. Escolha uma opção do menu.',
      message_confirm_schedule    TEXT DEFAULT 'Consulta agendada com sucesso!',
      message_confirm_reschedule  TEXT DEFAULT 'Consulta reagendada com sucesso!',
      message_confirm_cancel      TEXT DEFAULT 'Consulta cancelada.',
      created_at                  TEXT NOT NULL,
      updated_at                  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clinic_integrations (
      id                   TEXT PRIMARY KEY,
      clinic_id            TEXT NOT NULL,
      provider             TEXT NOT NULL,
      is_connected         INTEGER DEFAULT 0,
      google_access_token  TEXT,
      google_refresh_token TEXT,
      google_calendar_id   TEXT DEFAULT 'primary',
      gestaods_api_token   TEXT,
      gestaods_is_dev      INTEGER DEFAULT 1,
      last_sync_at         TEXT,
      sync_error           TEXT,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL,
      UNIQUE (clinic_id, provider)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_instances (
      id           TEXT PRIMARY KEY,
      clinic_id    TEXT NOT NULL,
      instance_id  TEXT,
      token        TEXT,
      provider     TEXT DEFAULT 'zapi',
      status       TEXT DEFAULT 'disconnected',
      client_token TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_integrations (
      id                    TEXT PRIMARY KEY,
      clinic_id             TEXT NOT NULL,
      provider              TEXT DEFAULT 'google',
      is_connected          INTEGER DEFAULT 0,
      google_access_token   TEXT,
      google_refresh_token  TEXT,
      google_calendar_id    TEXT DEFAULT 'primary',
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_replies (
      id         TEXT PRIMARY KEY,
      clinic_id  TEXT NOT NULL,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      category   TEXT DEFAULT 'geral',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                       TEXT PRIMARY KEY,
      clinic_id                TEXT NOT NULL,
      stripe_customer_id       TEXT,
      stripe_subscription_id   TEXT,
      stripe_price_id          TEXT,
      plan_key                 TEXT DEFAULT 'profissional',
      status                   TEXT DEFAULT 'active',
      current_period_end       TEXT,
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      id                    TEXT PRIMARY KEY,
      clinic_id             TEXT NOT NULL UNIQUE,
      enabled               INTEGER DEFAULT 1,
      reminder_hours_before INTEGER DEFAULT 24,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id             TEXT PRIMARY KEY,
      clinic_id      TEXT NOT NULL,
      appointment_id TEXT NOT NULL,
      type           TEXT,
      status         TEXT DEFAULT 'pending',
      scheduled_at   TEXT,
      sent_at        TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      clinic_id  TEXT NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT,
      body       TEXT,
      read       INTEGER DEFAULT 0,
      read_at    TEXT,
      metadata   TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS working_hours (
      id              TEXT PRIMARY KEY,
      clinic_id       TEXT NOT NULL,
      professional_id TEXT,
      day_of_week     INTEGER NOT NULL,
      start_time      TEXT NOT NULL,
      end_time        TEXT NOT NULL,
      is_available    INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS time_off (
      id              TEXT PRIMARY KEY,
      clinic_id       TEXT NOT NULL,
      professional_id TEXT,
      start_date      TEXT NOT NULL,
      end_date        TEXT NOT NULL,
      reason          TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         TEXT PRIMARY KEY,
      clinic_id  TEXT,
      level      TEXT,
      action     TEXT,
      event      TEXT,
      details    TEXT DEFAULT '{}',
      metadata   TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `)

  try {
    db.exec("ALTER TABLE appointments ADD COLUMN origin TEXT DEFAULT 'manual_doctorchat';")
  } catch {
    // Ignore when the column already exists in an existing local DB.
  }
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

function seedDefaults(db: Database.Database) {
  const now = new Date().toISOString()

  // Clínica padrão
  const hasClinic = db.prepare('SELECT id FROM clinics WHERE id = ?').get(LOCAL_CLINIC_ID)
  if (!hasClinic) {
    db.prepare(`
      INSERT INTO clinics (id, name, plan, subscription_status, created_at, updated_at)
      VALUES (?, 'Minha Clínica Local', 'profissional', 'active', ?, ?)
    `).run(LOCAL_CLINIC_ID, now, now)
  }

  // Perfil padrão
  const hasProfile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(LOCAL_USER_ID)
  if (!hasProfile) {
    db.prepare(`
      INSERT INTO profiles (id, user_id, clinic_id, role, email, full_name, created_at)
      VALUES (?, ?, ?, 'admin', 'local@local.dev', 'Usuário Local', ?)
    `).run(LOCAL_USER_ID, LOCAL_USER_ID, LOCAL_CLINIC_ID, now)
  }

  // Configurações do bot
  const hasBotSettings = db
    .prepare('SELECT id FROM bot_settings WHERE clinic_id = ?')
    .get(LOCAL_CLINIC_ID)
  if (!hasBotSettings) {
    const defaultWorkingHours = JSON.stringify({
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
      INSERT INTO bot_settings (
        id, clinic_id, bot_default_enabled, working_hours_enabled, working_hours,
        message_welcome, message_menu, message_out_of_hours, message_fallback,
        message_confirm_schedule, message_confirm_reschedule, message_confirm_cancel,
        created_at, updated_at
      ) VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `bot-${LOCAL_CLINIC_ID}`,
      LOCAL_CLINIC_ID,
      defaultWorkingHours,
      'Olá! Bem-vindo à nossa clínica.',
      'Como posso ajudar?\n1. Agendar consulta\n2. Ver agendamentos\n3. Cancelar consulta\n4. Falar com atendente',
      'Estamos fora do horário de atendimento. Retornaremos em breve.',
      'Desculpe, não entendi. Escolha uma opção do menu.',
      'Consulta agendada com sucesso!',
      'Consulta reagendada com sucesso!',
      'Consulta cancelada.',
      now,
      now,
    )
  }

  // Configurações de consulta
  const hasAppointmentSettings = db
    .prepare('SELECT id FROM appointment_settings WHERE clinic_id = ?')
    .get(LOCAL_CLINIC_ID)
  if (!hasAppointmentSettings) {
    db.prepare(`
      INSERT INTO appointment_settings (
        id, clinic_id, default_duration_minutes, created_at, updated_at
      ) VALUES (?, ?, 30, ?, ?)
    `).run(`apset-${LOCAL_CLINIC_ID}`, LOCAL_CLINIC_ID, now, now)
  }

  // Assinatura padrão
  const hasSub = db
    .prepare('SELECT id FROM subscriptions WHERE clinic_id = ?')
    .get(LOCAL_CLINIC_ID)
  if (!hasSub) {
    db.prepare(`
      INSERT INTO subscriptions (id, clinic_id, plan_key, status, created_at, updated_at)
      VALUES (?, ?, 'profissional', 'active', ?, ?)
    `).run(`sub-${LOCAL_CLINIC_ID}`, LOCAL_CLINIC_ID, now, now)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Campos que são armazenados como JSON no SQLite. */
const JSON_FIELDS = new Set([
  'bot_context',
  'working_hours',
  'metadata',
  'details',
])

/** Campos booleanos (armazenados como 0/1 no SQLite). */
const BOOL_FIELDS = new Set([
  'bot_enabled',
  'bot_default_enabled',
  'working_hours_enabled',
  'is_connected',
  'gestaods_is_dev',
  'is_available',
  'enabled',
  'read',
])

export function deserializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (JSON_FIELDS.has(k) && typeof v === 'string') {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    } else if (BOOL_FIELDS.has(k) && (v === 0 || v === 1)) {
      out[k] = v === 1
    } else {
      out[k] = v
    }
  }
  return out
}

export function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (JSON_FIELDS.has(k) && v !== null && typeof v === 'object') {
      out[k] = JSON.stringify(v)
    } else if (BOOL_FIELDS.has(k) && typeof v === 'boolean') {
      out[k] = v ? 1 : 0
    } else {
      out[k] = v
    }
  }
  return out
}
