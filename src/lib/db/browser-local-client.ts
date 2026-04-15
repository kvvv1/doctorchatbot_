/**
 * Mock do cliente Supabase para o BROWSER em modo LOCAL_DB=sqlite.
 *
 * NÃO importa better-sqlite3 (módulo Node.js).
 * Auth retorna um usuário hardcoded; queries de dados chamam as rotas /api/local/*.
 */

const LOCAL_USER = {
  id: 'local-user-00000000-0000-0000-0000-000000000001',
  email: 'local@local.dev',
  user_metadata: { full_name: 'Usuário Local', clinic_name: 'Minha Clínica Local' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

const FAKE_SESSION = { user: LOCAL_USER, access_token: 'local', token_type: 'bearer' }

// ─── Auth ────────────────────────────────────────────────────────────────────

const browserLocalAuth = {
  async signUp(_opts: unknown) {
    return { data: { user: LOCAL_USER, session: FAKE_SESSION }, error: null }
  },
  async signInWithPassword(_opts: unknown) {
    return { data: { user: LOCAL_USER, session: FAKE_SESSION }, error: null }
  },
  async signOut() {
    return { error: null }
  },
  async getUser() {
    return { data: { user: LOCAL_USER }, error: null }
  },
  async getSession() {
    return { data: { session: FAKE_SESSION }, error: null }
  },
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createBrowserLocalClient() {
  return {
    auth: browserLocalAuth,
    // Realtime não existe em modo local — retorna objeto inerte
    channel(_name: string) {
      const noop = { on: () => noop, subscribe: () => noop, unsubscribe: () => {} }
      return noop
    },
    removeChannel() {
      return null
    },

    // Os hooks (useConversations, useMessages) já usam fetch direto —
    // este from() é um fallback no-op para qualquer chamada residual.
    from(_table: string) {
      const noOp = { data: null, error: null }
      const self: Record<string, (..._args: unknown[]) => unknown> = {}
      const chain = () => self
      for (const m of ['select','insert','update','delete','eq','neq','gte','lte',
                        'gt','lt','in','not','is','or','order','limit']) {
        self[m] = chain
      }
      self.single      = async () => noOp
      self.maybeSingle = async () => noOp
      self.then        = ((res: (v: typeof noOp) => unknown) => Promise.resolve(noOp).then(res)) as (..._args: unknown[]) => unknown
      return self
    },
    rpc(_fn: string) {
      const noOp = { data: null, error: null }
      return {
        single: async () => noOp,
        then: (res: (v: typeof noOp) => unknown) => Promise.resolve(noOp).then(res),
      }
    },
  }
}
