import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createLocalClient } from '@/lib/db/local-client'

function getEnvOrThrow(name: string, value: string | undefined): string {
	if (!value) throw new Error(`Missing env var: ${name}`)
	return value
}

/**
 * Creates a Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * When LOCAL_DB=sqlite the client is backed by SQLite (no network needed).
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY otherwise.
 */
export async function createClient() {
  if (process.env.LOCAL_DB === 'sqlite') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createLocalClient() as any
  }
	const supabaseUrl = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
	const supabaseAnonKey = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

	// Next.js changed cookies() to async in newer versions.
	const cookieStore = await Promise.resolve(cookies() as unknown as any)

	return createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll()
			},
			setAll(cookiesToSet) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options)
					}
				} catch {
					// In Server Components, setting cookies can throw. It's safe to ignore.
				}
			},
		},
	})
}
