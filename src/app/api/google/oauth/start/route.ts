/**
 * Google OAuth Start Route
 * Redirects user to Google OAuth consent screen
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizationUrl } from '@/lib/calendar/googleCalendar'

export async function GET() {
	try {
		// Verify user is authenticated
		const supabase = await createClient()
		const {
			data: { user },
		} = await supabase.auth.getUser()

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Generate authorization URL
		const authUrl = getAuthorizationUrl()

		// Redirect to Google OAuth consent screen
		return NextResponse.redirect(authUrl)
	} catch (error) {
		console.error('Error starting OAuth flow:', error)
		return NextResponse.json(
			{ error: 'Failed to start OAuth flow' },
			{ status: 500 }
		)
	}
}
