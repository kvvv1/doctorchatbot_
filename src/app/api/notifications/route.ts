/**
 * API Route: Notifications
 * Get and manage in-app notifications
 */

import { NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/notifications
 * Get unread notifications for current user
 */
export async function GET() {
	try {
		const profile = await getSessionProfile()

		if (!profile) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey)

		const { data: notifications, error } = await supabase
			.from('notifications')
			.select('*')
			.eq('clinic_id', profile.clinic.id)
			.eq('read', false)
			.order('created_at', { ascending: false })
			.limit(50)

		if (error) {
			console.error('Error fetching notifications:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ notifications: notifications || [] })
	} catch (error) {
		console.error('Error in GET /api/notifications:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}

/**
 * POST /api/notifications
 * Mark notification(s) as read
 * 
 * Body: { notificationId: string } OR { markAllAsRead: true }
 */
export async function POST(request: Request) {
	try {
		const profile = await getSessionProfile()

		if (!profile) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await request.json()
		const supabase = createClient(supabaseUrl, supabaseServiceKey)

		if (body.markAllAsRead) {
			// Mark all notifications as read
			const { error } = await supabase
				.from('notifications')
				.update({
					read: true,
					read_at: new Date().toISOString(),
				})
				.eq('clinic_id', profile.clinic.id)
				.eq('read', false)

			if (error) {
				console.error('Error marking all as read:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			return NextResponse.json({ success: true })

		} else if (body.notificationId) {
			// Mark specific notification as read
			const { error } = await supabase
				.from('notifications')
				.update({
					read: true,
					read_at: new Date().toISOString(),
				})
				.eq('id', body.notificationId)
				.eq('clinic_id', profile.clinic.id) // Security: ensure user owns this notification

			if (error) {
				console.error('Error marking notification as read:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			return NextResponse.json({ success: true })

		} else {
			return NextResponse.json(
				{ error: 'Invalid request body' },
				{ status: 400 }
			)
		}
	} catch (error) {
		console.error('Error in POST /api/notifications:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
