import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createLocalClient } from '@/lib/db/local-client'

/**
 * Creates a Supabase admin client using the service role key.
 *
 * When LOCAL_DB=sqlite the client is backed by SQLite (no network needed).
 *
 * ⚠️ WARNING: This client bypasses Row Level Security (RLS).
 * Only use this in server-side code that cannot be called directly from the client.
 */
export function createAdminClient() {
  if (process.env.LOCAL_DB === 'sqlite') {
    return createLocalClient() as unknown as ReturnType<typeof createSupabaseClient>
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!supabaseServiceRole) {
    throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY')
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
