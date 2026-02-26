import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase admin client using the service role key.
 * 
 * ⚠️ WARNING: This client bypasses Row Level Security (RLS).
 * Only use this in server-side code that cannot be called directly from the client.
 * 
 * Use cases:
 * - Webhooks that need to write data without user authentication
 * - Background jobs
 * - Admin operations
 */
export function createAdminClient() {
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
