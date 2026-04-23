import { createAdminClient } from '@/lib/supabase/admin'
import {
  zapiSendChoices,
  zapiSendText,
  type ZapiChoiceOption,
  type ZapiCredentials,
} from '@/lib/zapi/client'
import { persistCanonicalMessage } from './messageReconciliationService'
import {
  getBrazilianPhoneLookupCandidates,
  normalizePhoneForStorage,
} from '@/lib/utils/phone'
import {
  getAppointmentTemplateParts,
} from '@/lib/utils/appointmentDateTime'

const DEFAULT_APPOINTMENT_CONFIRMED_TEMPLATE =
  'Ola {name}! Sua consulta foi agendada para {date} as {time}. Use os botoes abaixo para confirmar ou cancelar, se precisar.'

const ACTION_CONFIRM_PREFIX = 'notif_confirm:'
const ACTION_CANCEL_PREFIX = 'notif_cancel:'
const ACTION_RESCHEDULE_PREFIX = 'notif_reschedule:'
const ACTION_NO_RESCHEDULE_PREFIX = 'notif_no_reschedule:'

const INTERACTIVE_REMINDER_TYPES = new Set([
  'appointment_24h',
  'appointment_12h',
  'appointment_created_confirmation',
  'confirmation_request',
])

type ReminderRecord = {
  id: string
  clinic_id: string
  appointment_id: string | null
  conversation_id: string | null
  type: string
  status: string
  scheduled_for: string
  recipient_phone: string
  message_template: string
  retry_count?: number | null
  response_received?: boolean | null
  sent_at?: string | null
  message_sent?: string | null
  zapi_message_id?: string | null
  metadata?: Record<string, unknown> | null
}

type AppointmentRecord = {
  id: string
  clinic_id: string
  conversation_id: string | null
  patient_name: string
  patient_phone: string
  starts_at: string
  ends_at: string
  status: string
  provider: string | null
  provider_reference_id: string | null
}

export type NotificationAction =
  | { kind: 'confirm'; reminderId: string }
  | { kind: 'cancel'; reminderId: string }
  | { kind: 'reschedule'; appointmentId: string }
  | { kind: 'no_reschedule'; appointmentId: string }

export function parseNotificationActionId(
  value: string | null | undefined
): NotificationAction | null {
  if (!value) return null

  if (value.startsWith(ACTION_CONFIRM_PREFIX)) {
    return { kind: 'confirm', reminderId: value.slice(ACTION_CONFIRM_PREFIX.length) }
  }

  if (value.startsWith(ACTION_CANCEL_PREFIX)) {
    return { kind: 'cancel', reminderId: value.slice(ACTION_CANCEL_PREFIX.length) }
  }

  if (value.startsWith(ACTION_RESCHEDULE_PREFIX)) {
    return { kind: 'reschedule', appointmentId: value.slice(ACTION_RESCHEDULE_PREFIX.length) }
  }

  if (value.startsWith(ACTION_NO_RESCHEDULE_PREFIX)) {
    return { kind: 'no_reschedule', appointmentId: value.slice(ACTION_NO_RESCHEDULE_PREFIX.length) }
  }

  return null
}

export function buildReminderActionOptions(reminderId: string): ZapiChoiceOption[] {
  return [
    { id: `${ACTION_CONFIRM_PREFIX}${reminderId}`, label: 'Confirmar presenca' },
    { id: `${ACTION_CANCEL_PREFIX}${reminderId}`, label: 'Cancelar consulta' },
  ]
}

export function buildPostCancelOptions(appointmentId: string): ZapiChoiceOption[] {
  return [
    { id: `${ACTION_RESCHEDULE_PREFIX}${appointmentId}`, label: 'Quero remarcar' },
    { id: `${ACTION_NO_RESCHEDULE_PREFIX}${appointmentId}`, label: 'Nao quero remarcar' },
  ]
}

export function formatNotificationTemplate(
  template: string,
  appointment: Pick<AppointmentRecord, 'patient_name' | 'starts_at'>,
  patientNameOverride?: string | null
): string {
  const patientName = patientNameOverride || appointment.patient_name || 'Paciente'
  const parts = getAppointmentTemplateParts(appointment.starts_at)

  return template
    .replace(/\{name\}/g, patientName)
    .replace(/\{date\}/g, parts.date)
    .replace(/\{time\}/g, parts.time)
    .replace(/\{day\}/g, parts.day)
}

async function getWhatsappCredentials(
  clinicId: string
): Promise<ZapiCredentials> {
  const supabase = createAdminClient()

  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('instance_id, token, client_token, status')
    .eq('clinic_id', clinicId)
    .eq('provider', 'zapi')
    .single()

  if (error || !instance?.instance_id || !instance?.token) {
    throw new Error('WhatsApp instance not configured for this clinic')
  }

  if (instance.status !== 'connected') {
    throw new Error('WhatsApp instance is disconnected')
  }

  return {
    instanceId: instance.instance_id,
    token: instance.token,
    clientToken: instance.client_token || undefined,
  }
}

async function persistOutgoingConversationMessage(params: {
  clinicId: string
  conversationId: string
  content: string
  zapiMessageId?: string | null
  metadata?: Record<string, unknown>
}) {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  await persistCanonicalMessage({
    supabase,
    clinicId: params.clinicId,
    conversationId: params.conversationId,
    sender: 'bot',
    direction: 'outbound',
    origin: 'notification',
    content: params.content,
    zapiMessageId: params.zapiMessageId || null,
    externalStatus: 'sent',
    deliveryStatus: 'sent',
    metadata: params.metadata || {},
    createdAt: now,
    updatedAt: now,
  })
}

export async function sendClinicNotificationMessage(params: {
  clinicId: string
  phone: string
  text: string
  conversationId?: string | null
  reminderId?: string | null
  choices?: ZapiChoiceOption[]
  choicesTitle?: string
  messageSource?: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const credentials = await getWhatsappCredentials(params.clinicId)

    const result =
      params.choices && params.choices.length > 0
        ? await zapiSendChoices(
            credentials,
            normalizePhoneForStorage(params.phone) || params.phone,
            params.text,
            params.choices,
            params.choicesTitle || 'Opcoes disponiveis'
          )
        : await zapiSendText(credentials, normalizePhoneForStorage(params.phone) || params.phone, params.text)

    if (params.conversationId) {
      await persistOutgoingConversationMessage({
        clinicId: params.clinicId,
        conversationId: params.conversationId,
        content: params.text,
        zapiMessageId: result.messageId || null,
        metadata: {
          source: params.messageSource || 'notification_message',
          reminderId: params.reminderId || null,
          interactive: Boolean(params.choices && params.choices.length > 0),
        },
      })
    }

    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send WhatsApp message',
    }
  }
}

async function getReminderWithAppointment(reminderId: string): Promise<{
  reminder: ReminderRecord
  appointment: AppointmentRecord | null
} | null> {
  const supabase = createAdminClient()

  const { data: reminder, error } = await supabase
    .from('reminders')
    .select('id, clinic_id, appointment_id, conversation_id, type, status, scheduled_for, recipient_phone, message_template, retry_count, response_received, sent_at, message_sent, zapi_message_id, metadata')
    .eq('id', reminderId)
    .maybeSingle()

  if (error || !reminder) {
    return null
  }

  let appointment: AppointmentRecord | null = null

  if (reminder.appointment_id) {
    const { data: appointmentData } = await supabase
      .from('appointments')
      .select('id, clinic_id, conversation_id, patient_name, patient_phone, starts_at, ends_at, status, provider, provider_reference_id')
      .eq('id', reminder.appointment_id)
      .maybeSingle()

    appointment = (appointmentData as AppointmentRecord | null) || null
  }

  return {
    reminder: reminder as ReminderRecord,
    appointment,
  }
}

function isInteractiveReminderType(type: string): boolean {
  return INTERACTIVE_REMINDER_TYPES.has(type)
}

async function sendReminderRecord(reminder: ReminderRecord): Promise<{
  success: boolean
  finalStatus?: 'sent' | 'failed' | 'canceled'
  messageId?: string
  messageSent?: string
  error?: string
}> {
  const supabase = createAdminClient()

  let appointment: AppointmentRecord | null = null
  if (reminder.appointment_id) {
    const { data } = await supabase
      .from('appointments')
      .select('id, clinic_id, conversation_id, patient_name, patient_phone, starts_at, ends_at, status, provider, provider_reference_id')
      .eq('id', reminder.appointment_id)
      .maybeSingle()

    appointment = (data as AppointmentRecord | null) || null
  }

  if (!appointment) {
    return { success: false, finalStatus: 'failed', error: 'Appointment not found' }
  }

  if (['canceled', 'completed', 'no_show'].includes(appointment.status)) {
    await supabase
      .from('reminders')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id)

    return { success: false, finalStatus: 'canceled', error: 'Appointment is not active' }
  }

  const message = formatNotificationTemplate(
    reminder.message_template,
    appointment,
    appointment.patient_name
  )

  const sendResult = await sendClinicNotificationMessage({
    clinicId: reminder.clinic_id,
    phone: reminder.recipient_phone,
    text: message,
    conversationId: reminder.conversation_id || appointment.conversation_id,
    reminderId: reminder.id,
    choices: isInteractiveReminderType(reminder.type)
      ? buildReminderActionOptions(reminder.id)
      : undefined,
    choicesTitle: isInteractiveReminderType(reminder.type) ? 'Confirme sua consulta' : undefined,
    messageSource: 'notification_reminder',
  })

  if (!sendResult.success) {
    return {
      success: false,
      finalStatus: 'failed',
      error: sendResult.error,
    }
  }

  return {
    success: true,
    finalStatus: 'sent',
    messageId: sendResult.messageId,
    messageSent: message,
  }
}

export async function sendReminderById(reminderId: string): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  const supabase = createAdminClient()
  const payload = await getReminderWithAppointment(reminderId)

  if (!payload) {
    return { success: false, error: 'Reminder not found' }
  }

  const result = await sendReminderRecord(payload.reminder)

  if (result.success) {
    await supabase
      .from('reminders')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_sent: result.messageSent || null,
        zapi_message_id: result.messageId || null,
      })
      .eq('id', reminderId)

    return {
      success: true,
      messageId: result.messageId,
    }
  }

  if (result.finalStatus === 'canceled') {
    return {
      success: false,
      error: result.error,
    }
  }

  await supabase
    .from('reminders')
    .update({
      status: 'failed',
      error_message: result.error || 'Failed to send reminder',
      retry_count: (payload.reminder.retry_count || 0) + 1,
    })
    .eq('id', reminderId)

  return {
    success: false,
    error: result.error,
  }
}

export async function processPendingNotificationReminders(limit = 100): Promise<{
  processed: number
  sent: number
  failed: number
  errors: string[]
}> {
  const supabase = createAdminClient()

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, clinic_id, appointment_id, conversation_id, type, status, scheduled_for, recipient_phone, message_template, retry_count, response_received, sent_at, message_sent, zapi_message_id, metadata')
    .eq('status', 'pending')
    .or('retry_count.is.null,retry_count.lt.3')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error || !reminders) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: error ? [error.message] : [],
    }
  }

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const reminder of reminders as ReminderRecord[]) {
    const result = await sendReminderById(reminder.id)
    if (result.success) {
      sent += 1
    } else {
      failed += 1
      errors.push(`Reminder ${reminder.id}: ${result.error || 'Failed to send'}`)
    }
  }

  return {
    processed: reminders.length,
    sent,
    failed,
    errors,
  }
}

export async function resendInteractiveReminderButtons(params?: {
  type?: string
  limit?: number
}): Promise<{
  processed: number
  sent: number
  failed: number
  errors: string[]
}> {
  const supabase = createAdminClient()
  const reminderType = params?.type || 'appointment_24h'
  const limit = params?.limit || 100

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, clinic_id, appointment_id, conversation_id, type, status, scheduled_for, recipient_phone, message_template, retry_count, response_received, sent_at, message_sent, zapi_message_id, metadata')
    .eq('type', reminderType)
    .eq('status', 'sent')
    .eq('response_received', false)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (error || !reminders) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: error ? [error.message] : [],
    }
  }

  const actionableReminders = (reminders as ReminderRecord[]).filter(reminder => {
    if (!isInteractiveReminderType(reminder.type)) return false

    const metadata = reminder.metadata || {}
    return !metadata.interactive_resend_at
  })

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const reminder of actionableReminders) {
    const payload = await getReminderWithAppointment(reminder.id)
    if (!payload?.appointment) {
      failed += 1
      errors.push(`Reminder ${reminder.id}: Appointment not found`)
      continue
    }

    const appointment = payload.appointment
    const message =
      reminder.message_sent ||
      formatNotificationTemplate(
        reminder.message_template,
        appointment,
        appointment.patient_name
      )

    const sendResult = await sendClinicNotificationMessage({
      clinicId: reminder.clinic_id,
      phone: reminder.recipient_phone,
      text: message,
      conversationId: reminder.conversation_id || appointment.conversation_id,
      reminderId: reminder.id,
      choices: buildReminderActionOptions(reminder.id),
      choicesTitle: 'Confirme sua consulta',
      messageSource: 'notification_reminder_interactive_resend',
    })

    if (!sendResult.success) {
      failed += 1
      errors.push(`Reminder ${reminder.id}: ${sendResult.error || 'Failed to resend interactive reminder'}`)
      continue
    }

    const metadata = reminder.metadata || {}
    await supabase
      .from('reminders')
      .update({
        metadata: {
          ...metadata,
          interactive: true,
          interactive_resend_at: new Date().toISOString(),
          interactive_resend_message_id: sendResult.messageId || null,
        },
      })
      .eq('id', reminder.id)

    sent += 1
  }

  return {
    processed: actionableReminders.length,
    sent,
    failed,
    errors,
  }
}

async function getOrCreateNotificationSettings(clinicId: string): Promise<{
  appointment_confirmed_enabled: boolean
  appointment_confirmed_template: string
}> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('notification_settings')
    .select('appointment_confirmed_enabled, appointment_confirmed_template')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (data) {
    return {
      appointment_confirmed_enabled: data.appointment_confirmed_enabled ?? true,
      appointment_confirmed_template:
        data.appointment_confirmed_template || DEFAULT_APPOINTMENT_CONFIRMED_TEMPLATE,
    }
  }

  const { data: inserted } = await supabase
    .from('notification_settings')
    .insert({
      clinic_id: clinicId,
      appointment_confirmed_enabled: true,
      appointment_confirmed_template: DEFAULT_APPOINTMENT_CONFIRMED_TEMPLATE,
    })
    .select('appointment_confirmed_enabled, appointment_confirmed_template')
    .single()

  return {
    appointment_confirmed_enabled: inserted?.appointment_confirmed_enabled ?? true,
    appointment_confirmed_template:
      inserted?.appointment_confirmed_template || DEFAULT_APPOINTMENT_CONFIRMED_TEMPLATE,
  }
}

export async function sendImmediateAppointmentConfirmation(params: {
  clinicId: string
  appointmentId: string
  conversationId?: string | null
}): Promise<{ success: boolean; skipped?: boolean; reminderId?: string; error?: string }> {
  const supabase = createAdminClient()
  const settings = await getOrCreateNotificationSettings(params.clinicId)

  if (!settings.appointment_confirmed_enabled) {
    return { success: true, skipped: true }
  }

  const { data: existingReminder } = await supabase
    .from('reminders')
    .select('id, status')
    .eq('appointment_id', params.appointmentId)
    .eq('type', 'appointment_created_confirmation')
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingReminder?.id) {
    return {
      success: true,
      skipped: true,
      reminderId: existingReminder.id,
    }
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, clinic_id, conversation_id, patient_phone')
    .eq('id', params.appointmentId)
    .single()

  if (appointmentError || !appointment) {
    return {
      success: false,
      error: appointmentError?.message || 'Appointment not found',
    }
  }

  const { data: reminder, error } = await supabase
    .from('reminders')
    .insert({
      clinic_id: params.clinicId,
      appointment_id: params.appointmentId,
      conversation_id: params.conversationId ?? appointment.conversation_id ?? null,
      type: 'appointment_created_confirmation',
      scheduled_for: new Date().toISOString(),
      recipient_phone: appointment.patient_phone,
      message_template:
        settings.appointment_confirmed_template || DEFAULT_APPOINTMENT_CONFIRMED_TEMPLATE,
      metadata: {
        source: 'appointment_created_confirmation',
        interactive: true,
      },
    })
    .select('id')
    .single()

  if (error || !reminder) {
    return {
      success: false,
      error: error?.message || 'Failed to create confirmation reminder',
    }
  }

  const sendResult = await sendReminderById(reminder.id)

  if (!sendResult.success) {
    return {
      success: false,
      reminderId: reminder.id,
      error: sendResult.error,
    }
  }

  return {
    success: true,
    reminderId: reminder.id,
  }
}

export async function markReminderResponded(params: {
  reminderId: string
  response: string
}): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('reminders')
    .update({
      response_received: true,
      response_at: new Date().toISOString(),
      response_content: params.response,
    })
    .eq('id', params.reminderId)
}

export async function findLatestActionableReminder(params: {
  clinicId: string
  phone: string
}): Promise<ReminderRecord | null> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('reminders')
    .select('id, clinic_id, appointment_id, conversation_id, type, status, scheduled_for, recipient_phone, message_template, retry_count, response_received, sent_at, message_sent, zapi_message_id, metadata')
    .eq('clinic_id', params.clinicId)
    .in('recipient_phone', getBrazilianPhoneLookupCandidates(params.phone))
    .eq('status', 'sent')
    .eq('response_received', false)
    .in('type', Array.from(INTERACTIVE_REMINDER_TYPES))
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as ReminderRecord | null) || null
}

export async function getReminderContext(reminderId: string) {
  return getReminderWithAppointment(reminderId)
}

export async function sendPostCancellationPrompt(params: {
  clinicId: string
  phone: string
  appointmentId: string
  conversationId?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendClinicNotificationMessage({
    clinicId: params.clinicId,
    phone: params.phone,
    conversationId: params.conversationId,
    text: 'Consulta cancelada com sucesso. Deseja remarcar agora?',
    choices: buildPostCancelOptions(params.appointmentId),
    choicesTitle: 'Proximos passos',
    messageSource: 'notification_reschedule_prompt',
  })

  return {
    success: result.success,
    error: result.error,
  }
}
