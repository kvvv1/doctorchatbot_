import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LOCAL_CLINIC_ID, LOCAL_USER_ID } from '@/lib/db/sqlite'

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

type ProfileLookupColumn = 'user_id' | 'id'

function getDefaultClinicName(user: User) {
	const clinicName =
		typeof user.user_metadata?.clinic_name === 'string'
			? user.user_metadata.clinic_name.trim()
			: ''
	const fullName =
		typeof user.user_metadata?.full_name === 'string'
			? user.user_metadata.full_name.trim()
			: ''
	const emailPrefix = user.email?.split('@')[0]?.trim() ?? ''

	return clinicName || fullName || emailPrefix || 'Minha Clínica'
}

function isMissingColumnError(error: { code?: string; message?: string } | null, column: string) {
	if (!error) return false

	return (
		error.code === '42703' ||
		error.message?.includes(`column profiles.${column} does not exist`) === true
	)
}

async function findProfileByUser(
	admin: ReturnType<typeof createAdminClient>,
	userId: string
): Promise<{ profile: ProfileRow; lookupColumn: ProfileLookupColumn } | null> {
	for (const lookupColumn of ['user_id', 'id'] as const) {
		const { data, error } = await admin
			.from('profiles')
			.select(`${lookupColumn}, clinic_id, role, created_at`)
			.eq(lookupColumn, userId)
			.maybeSingle()

		if (data) {
			return {
				profile: {
					id: userId,
					clinic_id: data.clinic_id ?? '',
					role: data.role,
					created_at: data.created_at,
				},
				lookupColumn,
			}
		}

		if (error && !isMissingColumnError(error, lookupColumn)) {
			console.error(`[getSessionProfile] Failed to query profile by ${lookupColumn}:`, error)
		}
	}

	return null
}

async function provisionProfile(
	admin: ReturnType<typeof createAdminClient>,
	user: User
): Promise<{ profile: ProfileRow; clinic: ClinicRow } | null> {
	const { data: clinic, error: clinicError } = await admin
		.from('clinics')
		.insert({
			name: getDefaultClinicName(user),
			email: user.email ?? null,
		})
		.select('id, name, created_at')
		.single()

	if (clinicError || !clinic) {
		console.error('[getSessionProfile] Failed to provision clinic:', clinicError)
		return null
	}

	for (const lookupColumn of ['user_id', 'id'] as const) {
		const { data: profile, error: profileError } = await admin
			.from('profiles')
			.insert({
				[lookupColumn]: user.id,
				clinic_id: clinic.id,
				email: user.email ?? null,
				full_name:
					typeof user.user_metadata?.full_name === 'string'
						? user.user_metadata.full_name
						: null,
			})
			.select('clinic_id, role, created_at')
			.single()

		if (profile) {
			return {
				profile: {
					id: user.id,
					clinic_id: profile.clinic_id,
					role: profile.role,
					created_at: profile.created_at,
				},
				clinic: clinic as ClinicRow,
			}
		}

		if (profileError && !isMissingColumnError(profileError, lookupColumn)) {
			console.error(`[getSessionProfile] Failed to provision profile with ${lookupColumn}:`, profileError)
		}
	}

	return null
}

/** Sessão hardcoded para o modo LOCAL_DB=sqlite. */
export async function getLocalSessionProfile(): Promise<
  { user: User; profile: ProfileRow; clinic: ClinicRow }
> {
  const now = new Date().toISOString()
  const user: User = {
    id: LOCAL_USER_ID,
    email: 'local@local.dev',
    user_metadata: { full_name: 'Usuário Local', clinic_name: 'Minha Clínica Local' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: now,
  } as User
  const profile: ProfileRow = { id: LOCAL_USER_ID, clinic_id: LOCAL_CLINIC_ID, role: 'admin', created_at: now }
  const clinic: ClinicRow   = { id: LOCAL_CLINIC_ID, name: 'Minha Clínica Local', created_at: now }
  return { user, profile, clinic }
}

export async function getSessionProfile(): Promise<
	| { user: User; profile: ProfileRow; clinic: ClinicRow }
	| null
> {
  if (process.env.LOCAL_DB === 'sqlite') {
    return getLocalSessionProfile()
  }

	const supabase = await createClient()

	const {
		data: { user },
		error,
	} = await supabase.auth.getUser()

	if (error || !user) return null

	const admin = createAdminClient()

	const profileResult = await findProfileByUser(admin, user.id)

	if (!profileResult) {
		const provisioned = await provisionProfile(admin, user)
		if (!provisioned) return null

		return {
			user,
			profile: provisioned.profile,
			clinic: provisioned.clinic,
		}
	}

	const { profile, lookupColumn } = profileResult
	const needsClinicRecovery = !profile.clinic_id

	const { data: clinic, error: clinicError } = needsClinicRecovery
		? { data: null, error: null }
		: await admin
				.from('clinics')
				.select('id, name, created_at')
				.eq('id', profile.clinic_id)
				.maybeSingle()

	if (clinic) {
		return {
			user,
			profile,
			clinic: clinic as ClinicRow,
		}
	}

	if (clinicError) {
		console.error('[getSessionProfile] Failed to fetch clinic:', clinicError)
	}

	const { data: recoveredClinic, error: recoveredClinicError } = await admin
		.from('clinics')
		.insert({
			...(needsClinicRecovery ? {} : { id: profile.clinic_id }),
			name: getDefaultClinicName(user),
			email: user.email ?? null,
		})
		.select('id, name, created_at')
		.single()

	if (recoveredClinicError || !recoveredClinic) {
		console.error('[getSessionProfile] Failed to recover missing clinic:', recoveredClinicError)
		return null
	}

	const { error: syncProfileError } = await admin
		.from('profiles')
		.update({ clinic_id: recoveredClinic.id })
		.eq(lookupColumn, user.id)

	if (syncProfileError) {
		console.error('[getSessionProfile] Failed to sync recovered clinic to profile:', syncProfileError)
	}

	return {
		user,
		profile: {
			...profile,
			clinic_id: recoveredClinic.id,
		},
		clinic: recoveredClinic as ClinicRow,
	}
}
