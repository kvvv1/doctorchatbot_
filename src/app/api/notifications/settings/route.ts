/**
 * API Route: Notification Settings
 * Manage reminder templates and notification preferences
 */

import { NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

		const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
		const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
				.update(body)
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
				.insert({ clinic_id: profile.clinic.id, ...body })
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
