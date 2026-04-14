/**
 * Database types for Doctor Chat Bot
 */

export type ConversationStatus =
	| 'new'
	| 'in_progress'
	| 'waiting_patient'
	| 'waiting_human'
	| 'scheduled'
	| 'reschedule'
	| 'canceled'
	| 'waitlist'
	| 'done'

export type MessageSender = 'patient' | 'human' | 'bot'

// Canonical types live in bot/context — imported locally and re-exported for consumers
import type { BotState, BotContext } from '@/lib/bot/context'
export type { BotState, BotContext }

export interface Conversation {
	id: string
	clinic_id: string
	patient_phone: string
	patient_name: string | null
	cpf: string | null
	status: ConversationStatus
	bot_enabled: boolean
	bot_state: BotState
	bot_context: BotContext
	notes: string | null
	last_message_at: string | null
	last_message_preview: string | null
	last_patient_message_at: string | null
	created_at: string
	updated_at: string
}

export interface Message {
	id: string
	conversation_id: string
	sender: MessageSender
	content: string
	zapi_message_id: string | null
	created_at: string
	updated_at: string
}

export interface Profile {
	user_id: string
	clinic_id: string
	role: string
	created_at: string
}

export interface Clinic {
	id: string
	name: string
	plan?: string
	subscription_status?: string
	created_at: string
	updated_at: string
}

export type QuickReplyCategory =
	| 'geral'
	| 'agendamento'
	| 'informacoes'
	| 'procedimentos'
	| 'financeiro'
	| 'outros'

export interface QuickReply {
	id: string
	clinic_id: string
	title: string
	content: string
	category: QuickReplyCategory
	created_at: string
	updated_at: string
}

export type AppointmentStatus =
	| 'scheduled'
	| 'confirmed'
	| 'canceled'
	| 'completed'
	| 'no_show'

export type AppointmentProvider = 'google' | 'gestaods' | 'manual'

export interface Appointment {
	id: string
	clinic_id: string
	conversation_id: string | null
	patient_phone: string
	patient_name: string
	starts_at: string
	ends_at: string
	status: AppointmentStatus
	description: string | null
	provider: AppointmentProvider
	provider_reference_id: string | null
	created_at: string
	updated_at: string
}

export type CalendarProvider = 'google' | 'gestaods'

export interface CalendarIntegration {
	id: string
	clinic_id: string
	provider: CalendarProvider
	is_connected: boolean
	google_access_token: string | null
	google_refresh_token: string | null
	google_calendar_id: string
	created_at: string
	updated_at: string
}

export interface WorkingHoursDay {
	day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
	enabled: boolean
	start: string
	end: string
	// Turno da tarde (opcional – retrocompatível)
	has_afternoon?: boolean
	afternoon_start?: string
	afternoon_end?: string
}

export interface WorkingHours {
	timezone: string
	days: WorkingHoursDay[]
}

export interface BotSettings {
	id: string
	clinic_id: string
	bot_default_enabled: boolean
	// --- Clinic working hours (used by Agenda / calendar display) ---
	working_hours_enabled: boolean
	working_hours: WorkingHours
	// --- Bot response behaviour ---
	/** When true the bot replies 24/7, ignoring working_hours for the out-of-hours check */
	bot_respond_anytime: boolean
	// --- Bot scheduling availability (independent from clinic working hours) ---
	/** When true, use bot_scheduling_hours for slot availability instead of working_hours */
	bot_scheduling_hours_enabled: boolean
	/** Schedule the bot uses to determine available appointment slots */
	bot_scheduling_hours: WorkingHours
	// --- Messages ---
	message_welcome: string
	message_menu: string
	message_out_of_hours: string
	message_fallback: string
	message_confirm_schedule: string
	message_confirm_reschedule: string
	message_confirm_cancel: string
	created_at: string
	updated_at: string
}

export type SubscriptionStatus =
	| 'inactive'
	| 'active'
	| 'trialing'
	| 'past_due'
	| 'canceled'

export type PlanKey = 'essencial' | 'profissional' | 'clinic_pro' | 'fundador'

export interface Subscription {
	id: string
	clinic_id: string
	stripe_customer_id: string | null
	stripe_subscription_id: string | null
	stripe_price_id: string | null
	plan_key: PlanKey | null
	status: SubscriptionStatus
	current_period_end: string | null
	created_at: string
	updated_at: string
}
