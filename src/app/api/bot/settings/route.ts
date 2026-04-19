import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { updateBotSettings } from '@/lib/services/botSettingsService'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/bot/settings
 * Update bot settings for a clinic
 */
export async function PUT(request: NextRequest) {
	try {
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const { clinicId, settings } = await request.json()

		// Verify the user belongs to this clinic
		if (session.clinic.id !== clinicId) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
		}

		let updatedSettings = await updateBotSettings(clinicId, settings)

		// Fallback: if the update failed, retry without columns added in newer migrations.
		// menu_options/menu_order require migration 026/028; waitlist_notifications_enabled requires 038.
		if (!updatedSettings) {
			const { menu_options, menu_order, waitlist_notifications_enabled, ...settingsWithoutNewCols } = settings ?? {}
			updatedSettings = await updateBotSettings(clinicId, settingsWithoutNewCols)
		}

		if (!updatedSettings) {
			return NextResponse.json(
				{ error: 'Failed to update bot settings' },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			success: true,
			settings: updatedSettings,
		})
	} catch (error) {
		console.error('[API] Error updating bot settings:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
