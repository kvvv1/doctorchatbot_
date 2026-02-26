/**
 * Notification Service
 * Handles reminders, notifications, and automated WhatsApp messaging
 */

import { createClient } from '@supabase/supabase-js'
import type {
	Reminder,
	Notification,
	NotificationSettings,
	ReminderType,
	NotificationType,
} from '@/lib/types/notifications'
import type { Appointment } from '@/lib/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Get notification settings for a clinic
 */
export async function getNotificationSettings(
	clinicId: string
): Promise<NotificationSettings | null> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	const { data, error } = await supabase
		.from('notification_settings')
		.select('*')
		.eq('clinic_id', clinicId)
		.single()

	if (error) {
		console.error('Error fetching notification settings:', error)
		return null
	}

	return data
}

/**
 * Update notification settings for a clinic
 */
export async function updateNotificationSettings(
	clinicId: string,
	settings: Partial<NotificationSettings>
): Promise<NotificationSettings | null> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	// Check if settings exist
	const { data: existing } = await supabase
		.from('notification_settings')
		.select('id')
		.eq('clinic_id', clinicId)
		.single()

	if (existing) {
		// Update
		const { data, error } = await supabase
			.from('notification_settings')
			.update(settings)
			.eq('clinic_id', clinicId)
			.select()
			.single()

		if (error) {
			console.error('Error updating notification settings:', error)
			return null
		}

		return data
	} else {
		// Insert
		const { data, error } = await supabase
			.from('notification_settings')
			.insert({ clinic_id: clinicId, ...settings })
			.select()
			.single()

		if (error) {
			console.error('Error creating notification settings:', error)
			return null
		}

		return data
	}
}

/**
 * Process pending reminders
 * Should be called by a cron job every 5-10 minutes
 * SENDS MESSAGES VIA WHATSAPP USING Z-API
 */
export async function processPendingReminders(): Promise<{
	processed: number
	succeeded: number
	failed: number
}> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	// Get pending reminders
	const { data: reminders, error } = await supabase.rpc('get_pending_reminders')

	if (error || !reminders || reminders.length === 0) {
		console.log('[Reminders] No pending reminders to process')
		return { processed: 0, succeeded: 0, failed: 0 }
	}

	console.log(`[Reminders] Processing ${reminders.length} pending reminders`)

	let succeeded = 0
	let failed = 0

	for (const reminder of reminders) {
		try {
			// Get appointment details to fill template
			const { data: appointment } = await supabase
				.from('appointments')
				.select('*')
				.eq('id', reminder.appointment_id)
				.single()

			if (!appointment) {
				throw new Error('Appointment not found')
			}

			// Fill message template with real data
			const message = fillMessageTemplate(reminder.message_template, appointment)

			// Get clinic's Z-API credentials
			const { data: clinic } = await supabase
				.from('clinics')
				.select('id, zapi_instance_id, zapi_token')
				.eq('id', reminder.clinic_id)
				.single()

			if (!clinic?.zapi_instance_id || !clinic?.zapi_token) {
				throw new Error('Z-API not configured for clinic')
			}

			// Send message via WhatsApp using Z-API
			console.log(`[Reminders] Sending ${reminder.type} to ${reminder.recipient_phone}`)
			
			const zapiUrl = `https://api.z-api.io/instances/${clinic.zapi_instance_id}/token/${clinic.zapi_token}/send-text`
			
			const response = await fetch(zapiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					phone: reminder.recipient_phone,
					message: message,
				}),
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(`Z-API error: ${errorData.error || response.statusText}`)
			}

			// Update reminder as sent
			await supabase
				.from('reminders')
				.update({
					status: 'sent',
					sent_at: new Date().toISOString(),
					message_sent: message,
				})
				.eq('id', reminder.id)

			console.log(`[Reminders] ✓ Sent ${reminder.type} to ${reminder.recipient_phone}`)
			succeeded++
		} catch (error) {
			console.error(`[Reminders] ✗ Failed to send reminder ${reminder.id}:`, error)

			// Update reminder as failed
			await supabase
				.from('reminders')
				.update({
					status: 'failed',
					error_message: error instanceof Error ? error.message : 'Unknown error',
					retry_count: reminder.retry_count + 1,
				})
				.eq('id', reminder.id)

			failed++
		}
	}

	console.log(`[Reminders] Completed: ${succeeded} succeeded, ${failed} failed`)

	return {
		processed: reminders.length,
		succeeded,
		failed,
	}
}

/**
 * Fill message template with appointment data
 * Replaces {name}, {date}, {time}, {day} with real values
 */
function fillMessageTemplate(template: string, appointment: Appointment): string {
	const startsAt = new Date(appointment.starts_at)

	// Format date and time in Brazilian Portuguese
	const dateOptions: Intl.DateTimeFormatOptions = {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'America/Sao_Paulo',
	}

	const timeOptions: Intl.DateTimeFormatOptions = {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'America/Sao_Paulo',
	}

	const dayOptions: Intl.DateTimeFormatOptions = {
		weekday: 'long',
		timeZone: 'America/Sao_Paulo',
	}

	const replacements: Record<string, string> = {
		'{name}': appointment.patient_name,
		'{date}': startsAt.toLocaleDateString('pt-BR', dateOptions),
		'{time}': startsAt.toLocaleTimeString('pt-BR', timeOptions),
		'{day}': startsAt.toLocaleDateString('pt-BR', dayOptions),
	}

	let message = template
	for (const [key, value] of Object.entries(replacements)) {
		message = message.replace(new RegExp(key, 'g'), value)
	}

	return message
}

/**
 * Create in-app notification
 */
export async function createNotification(
	clinicId: string,
	type: NotificationType,
	title: string,
	message: string,
	options?: {
		userId?: string
		link?: string
		conversationId?: string
		appointmentId?: string
	}
): Promise<Notification | null> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	const { data, error } = await supabase
		.from('notifications')
		.insert({
			clinic_id: clinicId,
			user_id: options?.userId || null,
			type,
			title,
			message,
			link: options?.link || null,
			conversation_id: options?.conversationId || null,
			appointment_id: options?.appointmentId || null,
		})
		.select()
		.single()

	if (error) {
		console.error('Error creating notification:', error)
		return null
	}

	return data
}

/**
 * Get unread notifications for a clinic
 */
export async function getUnreadNotifications(
	clinicId: string,
	userId?: string
): Promise<Notification[]> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	let query = supabase
		.from('notifications')
		.select('*')
		.eq('clinic_id', clinicId)
		.eq('read', false)
		.order('created_at', { ascending: false })
		.limit(50)

	if (userId) {
		query = query.or(`user_id.eq.${userId},user_id.is.null`)
	}

	const { data, error } = await query

	if (error) {
		console.error('Error fetching notifications:', error)
		return []
	}

	return data || []
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
	notificationId: string
): Promise<boolean> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	const { error } = await supabase
		.from('notifications')
		.update({
			read: true,
			read_at: new Date().toISOString(),
		})
		.eq('id', notificationId)

	if (error) {
		console.error('Error marking notification as read:', error)
		return false
	}

	return true
}

/**
 * Mark all notifications as read for a clinic
 */
export async function markAllNotificationsAsRead(
	clinicId: string,
	userId?: string
): Promise<boolean> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	let query = supabase
		.from('notifications')
		.update({
			read: true,
			read_at: new Date().toISOString(),
		})
		.eq('clinic_id', clinicId)
		.eq('read', false)

	if (userId) {
		query = query.or(`user_id.eq.${userId},user_id.is.null`)
	}

	const { error } = await query

	if (error) {
		console.error('Error marking all notifications as read:', error)
		return false
	}

	return true
}

/**
 * Check for conversations without response and create alerts
 */
export async function checkNoResponseConversations(): Promise<number> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	// Get clinics with alert enabled
	const { data: settings } = await supabase
		.from('notification_settings')
		.select('clinic_id, no_response_alert_hours')
		.eq('no_response_alert_enabled', true)

	if (!settings || settings.length === 0) {
		return 0
	}

	let alertsCreated = 0

	for (const setting of settings) {
		const hoursAgo = new Date()
		hoursAgo.setHours(hoursAgo.getHours() - setting.no_response_alert_hours)

		// Find conversations waiting for response
		const { data: conversations } = await supabase
			.from('conversations')
			.select('id, patient_name, patient_phone')
			.eq('clinic_id', setting.clinic_id)
			.in('status', ['new', 'in_progress', 'waiting_patient'])
			.lt('last_patient_message_at', hoursAgo.toISOString())

		if (conversations && conversations.length > 0) {
			for (const conv of conversations) {
				await createNotification(
					setting.clinic_id,
					'no_response_24h',
					'Conversa sem resposta',
					`${conv.patient_name || conv.patient_phone} está aguardando resposta há mais de ${setting.no_response_alert_hours} horas.`,
					{
						link: `/dashboard/conversas?id=${conv.id}`,
						conversationId: conv.id,
					}
				)
				alertsCreated++
			}
		}
	}

	return alertsCreated
}

/**
 * Handle reminder confirmation response
 */
export async function handleReminderResponse(
	reminderId: string,
	response: string
): Promise<boolean> {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	const { error } = await supabase
		.from('reminders')
		.update({
			response_received: true,
			response_at: new Date().toISOString(),
			response_content: response,
		})
		.eq('id', reminderId)

	if (error) {
		console.error('Error updating reminder response:', error)
		return false
	}

	// If confirmation reminder, update appointment status
	const { data: reminder } = await supabase
		.from('reminders')
		.select('type, appointment_id')
		.eq('id', reminderId)
		.single()

	if (reminder?.type === 'confirmation_request' && reminder.appointment_id) {
		const isConfirmed = /sim|confirmo|ok|certeza/i.test(response)

		if (isConfirmed) {
			await supabase
				.from('appointments')
				.update({ status: 'confirmed' })
				.eq('id', reminder.appointment_id)
		}
	}

	return true
}

/**
 * Get reminder statistics for a clinic
 */
export async function getReminderStats(clinicId: string) {
	const supabase = createClient(supabaseUrl, supabaseServiceKey)

	const { data, error } = await supabase
		.from('reminder_stats')
		.select('*')
		.eq('clinic_id', clinicId)

	if (error) {
		console.error('Error fetching reminder stats:', error)
		return null
	}

	return data
}
