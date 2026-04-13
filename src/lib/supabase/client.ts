import { createBrowserClient } from '@supabase/ssr'
import { createBrowserLocalClient } from '@/lib/db/browser-local-client'

function getEnvOrThrow(name: string, value: string | undefined): string {
	if (!value) throw new Error(`Missing env var: ${name}`)
	return value
}

/**
 * Creates a Supabase client for use in Client Components.
 *
 * When NEXT_PUBLIC_LOCAL_DB=sqlite returns a browser-safe SQLite mock
 * (sem internet, sem Supabase). Caso contrário usa o Supabase normal.
 */
export function createClient() {
	if (process.env.NEXT_PUBLIC_LOCAL_DB === 'sqlite') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return createBrowserLocalClient() as any
	}

	const supabaseUrl = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
	const supabaseAnonKey = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

	return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
