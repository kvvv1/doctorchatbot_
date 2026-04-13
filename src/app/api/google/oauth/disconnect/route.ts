/**
 * Disconnect Google Calendar Route
 * Removes the calendar integration for the clinic
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
	try {
		const supabase = await createClient()
		const {
			data: { user },
		} = await supabase.auth.getUser()

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Get user's clinic_id
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('clinic_id')
			.eq('id', user.id)
			.single()

		if (profileError || !profile) {
			return NextResponse.json(
				{ error: 'Profile not found' },
				{ status: 404 }
			)
		}

		// Primary model: disconnect Google in clinic_integrations
		const { error: clinicIntegrationError } = await supabase
			.from('clinic_integrations')
			.update({
				is_connected: false,
				google_access_token: null,
				google_refresh_token: null,
				updated_at: new Date().toISOString(),
			})
			.eq('clinic_id', profile.clinic_id)
			.eq('provider', 'google')

		if (clinicIntegrationError) {
			console.error('Error disconnecting clinic integration:', clinicIntegrationError)
			return NextResponse.json(
				{ error: 'Failed to disconnect calendar' },
				{ status: 500 }
			)
		}

		// Legacy compatibility during migration
		const { error: updateError } = await supabase
			.from('calendar_integrations')
			.update({
				is_connected: false,
				google_access_token: null,
				google_refresh_token: null,
			})
			.eq('clinic_id', profile.clinic_id)

		if (updateError) {
			console.error('Error disconnecting calendar:', updateError)
			return NextResponse.json(
				{ error: 'Failed to disconnect calendar' },
				{ status: 500 }
			)
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in disconnect route:', error)
		return NextResponse.json(
			{ error: 'Failed to disconnect calendar' },
			{ status: 500 }
		)
	}
}
