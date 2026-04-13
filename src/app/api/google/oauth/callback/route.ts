/**
 * Google OAuth Callback Route
 * Handles the OAuth callback from Google and stores tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTokensFromCode } from '@/lib/calendar/googleCalendar'

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams
		const code = searchParams.get('code')
		const error = searchParams.get('error')

		// Handle OAuth errors
		if (error) {
			console.error('OAuth error:', error)
			return NextResponse.redirect(
				`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&error=oauth_failed`
			)
		}

		if (!code) {
			return NextResponse.redirect(
				`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&error=no_code`
			)
		}

		// Verify user is authenticated
		const supabase = await createClient()
		const {
			data: { user },
		} = await supabase.auth.getUser()

		if (!user) {
			return NextResponse.redirect(
				`${process.env.NEXT_PUBLIC_APP_URL}/login?error=unauthorized`
			)
		}

		// Get user's clinic_id
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('clinic_id')
			.eq('id', user.id)
			.single()

		if (profileError || !profile) {
			console.error('Error fetching profile:', profileError)
			return NextResponse.redirect(
				`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&error=profile_not_found`
			)
		}

		// Exchange code for tokens
		const { accessToken, refreshToken } = await getTokensFromCode(code)

		// Primary integration model: clinic_integrations (provider=google)
		const { data: existingClinicIntegration } = await supabase
			.from('clinic_integrations')
			.select('id')
			.eq('clinic_id', profile.clinic_id)
			.eq('provider', 'google')
			.maybeSingle()

		if (existingClinicIntegration) {
			const { error: updateError } = await supabase
				.from('clinic_integrations')
				.update({
					provider: 'google',
					is_connected: true,
					google_access_token: accessToken,
					google_refresh_token: refreshToken,
					google_calendar_id: 'primary',
					updated_at: new Date().toISOString(),
				})
				.eq('id', existingClinicIntegration.id)

			if (updateError) {
				console.error('Error updating clinic integration:', updateError)
				return NextResponse.redirect(
					`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&error=update_failed`
				)
			}
		} else {
			// Create new clinic integration row
			const { error: insertError } = await supabase
				.from('clinic_integrations')
				.insert({
					clinic_id: profile.clinic_id,
					provider: 'google',
					is_connected: true,
					google_access_token: accessToken,
					google_refresh_token: refreshToken,
					google_calendar_id: 'primary',
				})

			if (insertError) {
				console.error('Error creating clinic integration:', insertError)
				return NextResponse.redirect(
					`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&error=insert_failed`
				)
			}
		}

		// Legacy compatibility: keep calendar_integrations updated while migration is in progress.
		const { data: legacyIntegration } = await supabase
			.from('calendar_integrations')
			.select('id')
			.eq('clinic_id', profile.clinic_id)
			.maybeSingle()

		if (legacyIntegration) {
			await supabase
				.from('calendar_integrations')
				.update({
					is_connected: true,
					google_access_token: accessToken,
					google_refresh_token: refreshToken,
					google_calendar_id: 'primary',
					updated_at: new Date().toISOString(),
				})
				.eq('id', legacyIntegration.id)
		} else {
			await supabase.from('calendar_integrations').insert({
				clinic_id: profile.clinic_id,
				provider: 'google',
				is_connected: true,
				google_access_token: accessToken,
				google_refresh_token: refreshToken,
				google_calendar_id: 'primary',
			})
		}

		// Redirect back to settings page with success
		return NextResponse.redirect(
			`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&success=connected`
		)
	} catch (error) {
		console.error('Error in OAuth callback:', error)
		return NextResponse.redirect(
			`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/configuracoes?tab=agenda&error=callback_failed`
		)
	}
}
