import { createBrowserClient } from '@supabase/ssr'

function getEnvOrThrow(name: string, value: string | undefined): string {
	if (!value) throw new Error(`Missing env var: ${name}`)
	return value
}

/**
 * Creates a Supabase client for use in Client Components.
 * 
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Automatically handles cookie-based auth state on the client side.
 */
export function createClient() {
	const supabaseUrl = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
	const supabaseAnonKey = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

	return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
