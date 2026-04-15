/**
 * Google OAuth Start Route
 * Redirects user to Google OAuth consent screen
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizationUrl } from '@/lib/calendar/googleCalendar'
import { checkFeatureAccess } from '@/lib/services/subscriptionService'
import { PlanFeature } from '@/lib/services/planFeatures'

export async function GET(request: NextRequest) {
	try {
		// Verify user is authenticated
		const supabase = await createClient()
		const {
			data: { user },
		} = await supabase.auth.getUser()

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('clinic_id')
			.eq('id', user.id)
			.maybeSingle()

		if (profileError || !profile?.clinic_id) {
			return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
		}

		const hasCalendarIntegrationAccess = await checkFeatureAccess(
			profile.clinic_id,
			PlanFeature.CALENDAR_INTEGRATION
		)

		if (!hasCalendarIntegrationAccess) {
			return NextResponse.redirect(
				new URL('/dashboard/configuracoes?tab=agenda&error=upgrade_required', request.url)
			)
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
