import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import {
	isPushConfigured,
	removePushSubscription,
	upsertPushSubscription,
	type BrowserPushSubscription,
} from '@/lib/services/pushService'

export async function POST(request: NextRequest) {
	try {
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		if (!isPushConfigured()) {
			return NextResponse.json({ ok: false, disabled: true }, { status: 200 })
		}

		const body = await request.json()
		const subscription = body?.subscription as BrowserPushSubscription | undefined

		if (
			!subscription?.endpoint ||
			!subscription.keys?.p256dh ||
			!subscription.keys?.auth
		) {
			return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
		}

		const result = await upsertPushSubscription({
			userId: session.user.id,
			subscription,
			userAgent: request.headers.get('user-agent'),
		})

		return NextResponse.json({ ok: true, disabled: result.disabled })
	} catch (error) {
		console.error('[PushSubscriptions] Failed to save subscription:', error)
		return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		if (!isPushConfigured()) {
			return NextResponse.json({ ok: false, disabled: true }, { status: 200 })
		}

		const body = await request.json()
		const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''

		if (!endpoint) {
			return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
		}

		const result = await removePushSubscription({
			userId: session.user.id,
			endpoint,
		})

		return NextResponse.json({ ok: true, disabled: result.disabled })
	} catch (error) {
		console.error('[PushSubscriptions] Failed to remove subscription:', error)
		return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
	}
}
