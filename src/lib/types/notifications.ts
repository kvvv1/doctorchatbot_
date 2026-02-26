/**
 * Notification and Reminder Types
 */

export type ReminderType =
	| 'appointment_24h'
	| 'appointment_2h'
	| 'appointment_1h'
	| 'no_response_alert'
	| 'follow_up'
	| 'confirmation_request'

export type ReminderStatus =
	| 'pending'
	| 'sent'
	| 'failed'
	| 'canceled'

export interface Reminder {
	id: string
	clinic_id: string
	appointment_id: string | null
	conversation_id: string | null
	type: ReminderType
	scheduled_for: string
	sent_at: string | null
	status: ReminderStatus
	recipient_phone: string
	message_template: string
	message_sent: string | null
	response_received: boolean
	response_at: string | null
	response_content: string | null
	error_message: string | null
	retry_count: number
	created_at: string
	updated_at: string
}

export type NotificationType =
	| 'new_conversation'
	| 'conversation_waiting'
	| 'no_response_24h'
	| 'appointment_confirmed'
	| 'appointment_canceled'
	| 'low_response_rate'

export interface Notification {
	id: string
	clinic_id: string
	user_id: string | null
	type: NotificationType
	title: string
	message: string
	link: string | null
	conversation_id: string | null
	appointment_id: string | null
	read: boolean
	read_at: string | null
	created_at: string
}

export interface NotificationSettings {
	id: string
	clinic_id: string
	reminder_48h_enabled: boolean
	reminder_48h_template: string
	reminder_24h_enabled: boolean
	reminder_24h_template: string
	reminder_2h_enabled: boolean
	reminder_2h_template: string
	reminder_1h_enabled: boolean
	reminder_1h_template: string
	confirmation_enabled: boolean
	confirmation_template: string
	confirmation_hours_before: number
	no_response_alert_enabled: boolean
	no_response_alert_hours: number
	follow_up_enabled: boolean
	follow_up_days_after: number
	follow_up_template: string
	notify_new_conversation: boolean
	notify_conversation_waiting: boolean
	notify_no_response_24h: boolean
	custom_reminders?: Array<{
		enabled: boolean
		hours_before: number
		template: string
	}>
	created_at: string
	updated_at: string
}
