import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type ProfileRow = {
	id: string
	clinic_id: string
	role: string
	created_at: string
}

export type ClinicRow = {
	id: string
	name: string
	created_at: string
}

export async function getSessionProfile(): Promise<
	| { user: User; profile: ProfileRow; clinic: ClinicRow }
	| null
> {
	const supabase = await createClient()

	const {
		data: { user },
	} = await supabase.auth.getUser()

	if (!user) return null

	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('id, clinic_id, role, created_at')
		.eq('id', user.id)
		.single()

	if (profileError || !profile) return null

	const { data: clinic, error: clinicError } = await supabase
		.from('clinics')
		.select('id, name, created_at')
		.eq('id', profile.clinic_id)
		.single()

	if (clinicError || !clinic) return null

	return {
		user,
		profile: profile as ProfileRow,
		clinic: clinic as ClinicRow,
	}
}
