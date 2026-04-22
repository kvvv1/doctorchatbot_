/**
 * API Route: Notification Settings
 * Manage reminder templates and notification preferences
 */

import { NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/settings
 * Get notification settings for current clinic
 */
export async function GET() {
	try {
		const profile = await getSessionProfile()

		if (!profile) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const supabase = createAdminClient()

		// Try to get existing settings
		let { data: settings, error } = await supabase
			.from('notification_settings')
			.select('*')
			.eq('clinic_id', profile.clinic.id)
			.single()

		// If not found, create with defaults
		if (error && error.code === 'PGRST116') {
			const { data: newSettings, error: createError } = await supabase
				.from('notification_settings')
				.insert({ clinic_id: profile.clinic.id })
				.select()
				.single()

			if (createError) {
				console.error('Error creating notification settings:', createError)
				return NextResponse.json(
					{ error: createError.message },
					{ status: 500 }
				)
			}

			settings = newSettings
		} else if (error) {
			console.error('Error fetching notification settings:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ settings })
	} catch (error) {
		console.error('Error in GET /api/notifications/settings:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}

/**
 * POST /api/notifications/settings
 * Update notification settings
 */
export async function POST(request: Request) {
	try {
		const profile = await getSessionProfile()

		if (!profile) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await request.json()
		const supabase = createAdminClient()

		// Only pass known columns to avoid DB errors from unknown fields
		const allowedFields = [
			'reminder_48h_enabled', 'reminder_48h_template', 'reminder_48h_hours_before',
			'reminder_24h_enabled', 'reminder_24h_template', 'reminder_24h_hours_before',
			'reminder_12h_enabled', 'reminder_12h_template', 'reminder_12h_hours_before',
			'reminder_2h_enabled', 'reminder_2h_template', 'reminder_2h_hours_before',
			'appointment_confirmed_enabled', 'appointment_confirmed_template',
			'custom_reminders',
		]
		const payload = Object.fromEntries(
			Object.entries(body).filter(([key]) => allowedFields.includes(key))
		)

		// Check if settings exist
		const { data: existing } = await supabase
			.from('notification_settings')
			.select('id')
			.eq('clinic_id', profile.clinic.id)
			.single()

		if (existing) {
			// Update existing settings
			const { data: settings, error } = await supabase
				.from('notification_settings')
				.update(payload)
				.eq('clinic_id', profile.clinic.id)
				.select()
				.single()

			if (error) {
				console.error('Error updating notification settings:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			return NextResponse.json({ settings })
		} else {
			// Create new settings
			const { data: settings, error } = await supabase
				.from('notification_settings')
				.insert({ clinic_id: profile.clinic.id, ...payload })
				.select()
				.single()

			if (error) {
				console.error('Error creating notification settings:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			return NextResponse.json({ settings })
		}
	} catch (error) {
		console.error('Error in POST /api/notifications/settings:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
