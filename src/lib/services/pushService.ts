import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PushSubscriptionRecord } from '@/lib/types/database'

export type BrowserPushSubscription = {
	endpoint: string
	keys: {
		p256dh: string
		auth: string
	}
}

export type PushPayload = {
	title: string
	body: string
	url?: string | null
	tag?: string
	data?: Record<string, unknown>
}

type PushConfig = {
	publicKey: string
	privateKey: string
	subject: string
}

function getPushConfig(): PushConfig | null {
	const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
	const privateKey = process.env.VAPID_PRIVATE_KEY
	const subject = process.env.VAPID_SUBJECT

	if (!publicKey || !privateKey || !subject) {
		return null
	}

	return { publicKey, privateKey, subject }
}

function configureWebPush() {
	const config = getPushConfig()
	if (!config) return null

	webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
	return config
}

export function isPushConfigured() {
	return Boolean(getPushConfig())
}

export async function upsertPushSubscription(params: {
	userId: string
	subscription: BrowserPushSubscription
	userAgent?: string | null
}) {
	if (process.env.LOCAL_DB === 'sqlite') {
		return { ok: true as const, disabled: true }
	}

	const admin = createAdminClient()
	const now = new Date().toISOString()

	const { data, error } = await admin
		.from('push_subscriptions')
		.upsert(
			{
				user_id: params.userId,
				endpoint: params.subscription.endpoint,
				p256dh: params.subscription.keys.p256dh,
				auth: params.subscription.keys.auth,
				user_agent: params.userAgent ?? null,
				last_seen_at: now,
				disabled_at: null,
				updated_at: now,
			},
			{ onConflict: 'endpoint' },
		)
		.select('*')
		.single()

	if (error) {
		throw error
	}

	return {
		ok: true as const,
		record: data as PushSubscriptionRecord,
		disabled: false,
	}
}

export async function removePushSubscription(params: {
	userId: string
	endpoint: string
}) {
	if (process.env.LOCAL_DB === 'sqlite') {
		return { ok: true as const, disabled: true }
	}

	const admin = createAdminClient()
	const { error } = await admin
		.from('push_subscriptions')
		.delete()
		.eq('user_id', params.userId)
		.eq('endpoint', params.endpoint)

	if (error) {
		throw error
	}

	return { ok: true as const, disabled: false }
}

async function disableSubscription(endpoint: string) {
	const admin = createAdminClient()
	await admin
		.from('push_subscriptions')
		.update({
			disabled_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq('endpoint', endpoint)
}

async function getClinicUserIds(clinicId: string) {
	const admin = createAdminClient()
	const { data, error } = await admin
		.from('profiles')
		.select('id')
		.eq('clinic_id', clinicId)

	if (error) {
		throw error
	}

	return (data || []).map((profile) => profile.id)
}

export async function sendPushToClinicUsers(params: {
	clinicId: string
	userId?: string | null
	payload: PushPayload
}) {
	const config = configureWebPush()
	if (!config || process.env.LOCAL_DB === 'sqlite') {
		return { delivered: 0, skipped: true }
	}

	const targetUserIds = params.userId
		? [params.userId]
		: await getClinicUserIds(params.clinicId)

	if (targetUserIds.length === 0) {
		return { delivered: 0, skipped: true }
	}

	const admin = createAdminClient()
	const { data: subscriptions, error } = await admin
		.from('push_subscriptions')
		.select('*')
		.in('user_id', targetUserIds)
		.is('disabled_at', null)

	if (error) {
		throw error
	}

	let delivered = 0
	const payload = JSON.stringify(params.payload)

	for (const record of (subscriptions || []) as PushSubscriptionRecord[]) {
		try {
			await webpush.sendNotification(
				{
					endpoint: record.endpoint,
					keys: {
						p256dh: record.p256dh,
						auth: record.auth,
					},
				},
				payload,
			)
			delivered += 1
		} catch (error) {
			const statusCode =
				typeof error === 'object' && error && 'statusCode' in error
					? Number((error as { statusCode?: unknown }).statusCode)
					: null

			if (statusCode === 404 || statusCode === 410) {
				await disableSubscription(record.endpoint)
			} else {
				console.error('[PushService] Failed to deliver push:', error)
			}
		}
	}

	return { delivered, skipped: false }
}
