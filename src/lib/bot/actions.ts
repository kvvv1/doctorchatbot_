/**
 * Bot Actions
 * All database operations the bot needs — no internal HTTP calls.
 * Uses the admin client (bypasses RLS) since the bot acts on behalf of the clinic.
 */

import { addDays, setHours, setMinutes, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createAdminClient } from '@/lib/supabase/admin'
import { interpolate } from './interpolate'
import {
  cancelExternalAppointment,
  createExternalAppointment,
  updateExternalAppointment,
} from '@/lib/integrations/integrationRouter'
import type { AppointmentSummary, Slot } from './context'

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type ActionResult = {
  success: boolean
  message: string
  id?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Date / time parsing (canonical location — replaces botAppointmentService)
// ---------------------------------------------------------------------------

/**
 * Parse a free-text day into a Date.
 * Supports: hoje, amanhã, segunda, 15/02, 15-02
 */
export function parseDayText(dayText: string): Date | null {
  const text = dayText.toLowerCase().trim()
  const now = new Date()

  if (/hoje/i.test(text)) return now
  if (/amanh[ãa]/i.test(text)) return addDays(now, 1)
  if (/depois.*amanh|daqui.*2.*dia/i.test(text)) return addDays(now, 2)

  const weekdays = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado']
  for (let i = 0; i < weekdays.length; i++) {
    if (text.includes(weekdays[i])) {
      // Map index to JS getDay() value (0 = Sunday)
      const dayIndex = [0, 1, 2, 2, 3, 4, 5, 6, 6][i]
      const currentDay = now.getDay()
      let daysToAdd = dayIndex - currentDay
      if (daysToAdd <= 0) daysToAdd += 7
      return addDays(now, daysToAdd)
    }
  }

  // DD/MM or DD-MM
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})/)
  if (dateMatch) {
    const day = parseInt(dateMatch[1])
    const month = parseInt(dateMatch[2]) - 1
    const date = new Date(now.getFullYear(), month, day)
    if (date < now) date.setFullYear(now.getFullYear() + 1)
    return date
  }

  return null
}

/**
 * Parse a free-text time into { hours, minutes }.
 * Supports: 14:30, 14h30, 14h, 2 da tarde, 9 da manhã
 */
export function parseTimeText(timeText: string): { hours: number; minutes: number } | null {
  const text = timeText.toLowerCase().trim()

  const colonMatch = text.match(/(\d{1,2}):(\d{2})/)
  if (colonMatch) return { hours: parseInt(colonMatch[1]), minutes: parseInt(colonMatch[2]) }

  const hMatch = text.match(/(\d{1,2})h(\d{2})?/)
  if (hMatch) return { hours: parseInt(hMatch[1]), minutes: hMatch[2] ? parseInt(hMatch[2]) : 0 }

  const periodMatch = text.match(/(\d{1,2}).*(?:da )?(manh[ãa]|tarde|noite)/i)
  if (periodMatch) {
    let hours = parseInt(periodMatch[1])
    const period = periodMatch[2]
    if ((period.includes('tarde') || period.includes('noite')) && hours < 12) hours += 12
    return { hours, minutes: 0 }
  }

  const numOnly = text.match(/^(\d{1,2})$/)
  if (numOnly) return { hours: parseInt(numOnly[1]), minutes: 0 }

  return null
}

/**
 * Format a Date into a human-readable slot label.
 * e.g. "Segunda-feira, 14/04 às 10h00"
 */
export function formatSlotLabel(date: Date): string {
  return format(date, "EEEE, dd/MM 'às' HH'h'mm", { locale: ptBR })
}

// ---------------------------------------------------------------------------
// Appointment operations
// ---------------------------------------------------------------------------

/**
 * Fetch appointment settings for a clinic.
 * Returns defaults if no settings row exists.
 */
async function getAppointmentSettings(clinicId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('appointment_settings')
    .select('default_duration_minutes, buffer_time_minutes, min_advance_booking_hours')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  return {
    durationMinutes: data?.default_duration_minutes ?? 30,
    bufferMinutes: data?.buffer_time_minutes ?? 0,
    minAdvanceHours: data?.min_advance_booking_hours ?? 2,
  }
}

/**
 * Create an appointment for a patient via the bot.
 */
export async function createAppointment(params: {
  clinicId: string
  conversationId: string
  patientName: string
  patientPhone: string
  dayText: string
  timeText: string
  confirmTemplate?: string
}): Promise<ActionResult & { slot?: Slot }> {
  const supabase = createAdminClient()

  const parsedDate = parseDayText(params.dayText)
  if (!parsedDate) {
    return {
      success: false,
      message: 'Não consegui entender a data. Pode repetir? (Ex: "amanhã", "segunda-feira", "15/04")',
      error: 'invalid_date',
    }
  }

  const parsedTime = parseTimeText(params.timeText)
  if (!parsedTime) {
    return {
      success: false,
      message: 'Não consegui entender o horário. Pode repetir? (Ex: "14h30", "2 da tarde")',
      error: 'invalid_time',
    }
  }

  const settings = await getAppointmentSettings(params.clinicId)
  const startsAt = setMinutes(setHours(parsedDate, parsedTime.hours), parsedTime.minutes)
  const endsAt = new Date(startsAt.getTime() + settings.durationMinutes * 60_000)

  const externalResult = await createExternalAppointment({
    supabase,
    clinicId: params.clinicId,
    patientName: params.patientName,
    patientPhone: params.patientPhone,
    startsAt,
    endsAt,
    description: 'Agendamento via WhatsApp',
    conversationId: params.conversationId,
  })

  if (externalResult.provider !== 'none' && !externalResult.synced) {
    return {
      success: false,
      message: externalResult.error || 'Não consegui confirmar o agendamento na agenda integrada.',
      error: externalResult.error || 'external_sync_failed',
    }
  }

  // Minimum advance booking check
  const minBookingTime = new Date(Date.now() + settings.minAdvanceHours * 3_600_000)
  if (startsAt < minBookingTime) {
    return {
      success: false,
      message: `Agendamentos precisam ser feitos com pelo menos ${settings.minAdvanceHours}h de antecedência. Pode escolher outro horário?`,
      error: 'too_soon',
    }
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      clinic_id: params.clinicId,
      conversation_id: params.conversationId,
      patient_name: params.patientName,
      patient_phone: params.patientPhone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'scheduled',
      provider: externalResult.synced ? externalResult.provider : 'manual',
      provider_reference_id: externalResult.providerReferenceId || null,
      description: 'Agendamento via WhatsApp',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[bot/actions] createAppointment error:', error)
    return {
      success: false,
      message: 'Não consegui confirmar o agendamento. Pode tentar novamente?',
      error: error.message,
    }
  }

  const label = formatSlotLabel(startsAt)
  const dataStr = format(startsAt, "EEE, dd/MM", { locale: ptBR })
  const horarioStr = format(startsAt, "HH'h'mm", { locale: ptBR })
  const successMessage = params.confirmTemplate
    ? interpolate(params.confirmTemplate, { nome: params.patientName, data: dataStr, horario: horarioStr })
    : `✅ Agendamento confirmado!\n\n📅 ${label}\n👤 ${params.patientName}\n\nVocê receberá um lembrete antes da consulta. Para cancelar ou remarcar, é só me avisar. 😊`
  return {
    success: true,
    id: data.id,
    message: successMessage,
    slot: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), label },
  }
}

/**
 * Create an appointment from a pre-resolved Slot (e.g. after conflict resolution).
 */
export async function createAppointmentFromSlot(params: {
  clinicId: string
  conversationId: string
  patientName: string
  patientPhone: string
  slot: Slot
  confirmTemplate?: string
}): Promise<ActionResult> {
  const supabase = createAdminClient()

  const externalResult = await createExternalAppointment({
    supabase,
    clinicId: params.clinicId,
    patientName: params.patientName,
    patientPhone: params.patientPhone,
    startsAt: new Date(params.slot.startsAt),
    endsAt: new Date(params.slot.endsAt),
    description: 'Agendamento via WhatsApp',
    conversationId: params.conversationId,
  })

  if (externalResult.provider !== 'none' && !externalResult.synced) {
    return {
      success: false,
      message: externalResult.error || 'Não consegui confirmar o agendamento na agenda integrada.',
      error: externalResult.error || 'external_sync_failed',
    }
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      clinic_id: params.clinicId,
      conversation_id: params.conversationId,
      patient_name: params.patientName,
      patient_phone: params.patientPhone,
      starts_at: params.slot.startsAt,
      ends_at: params.slot.endsAt,
      status: 'scheduled',
      provider: externalResult.synced ? externalResult.provider : 'manual',
      provider_reference_id: externalResult.providerReferenceId || null,
      description: 'Agendamento via WhatsApp',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[bot/actions] createAppointmentFromSlot error:', error)
    return {
      success: false,
      message: 'Não consegui confirmar o agendamento. Pode tentar novamente?',
      error: error.message,
    }
  }

  const slotDate = new Date(params.slot.startsAt)
  const dataStr = format(slotDate, "EEE, dd/MM", { locale: ptBR })
  const horarioStr = format(slotDate, "HH'h'mm", { locale: ptBR })
  const successMessage = params.confirmTemplate
    ? interpolate(params.confirmTemplate, { nome: params.patientName, data: dataStr, horario: horarioStr })
    : `✅ Agendamento confirmado!\n\n📅 ${params.slot.label}\n👤 ${params.patientName}\n\nVocê receberá um lembrete antes da consulta. Para cancelar ou remarcar, é só me avisar. 😊`
  return {
    success: true,
    id: data.id,
    message: successMessage,
  }
}

/**
 * Cancel an appointment by ID (hard status update, no delete).
 */
export async function cancelAppointment(
  clinicId: string,
  appointmentId: string,
  confirmTemplate?: string
): Promise<ActionResult> {
  const supabase = createAdminClient()

  const { data: appointment } = await supabase
    .from('appointments')
    .select('provider, provider_reference_id, starts_at, patient_name')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (appointment?.provider && appointment.provider !== 'manual') {
    const externalResult = await cancelExternalAppointment({
      supabase,
      clinicId,
      provider: appointment.provider,
      providerReferenceId: appointment.provider_reference_id,
    })

    if (!externalResult.synced) {
      return {
        success: false,
        message: externalResult.error || 'Não consegui cancelar na agenda integrada. Pode tentar novamente?',
        error: externalResult.error || 'external_cancel_failed',
      }
    }
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)

  if (error) {
    console.error('[bot/actions] cancelAppointment error:', error)
    return {
      success: false,
      message: 'Não consegui cancelar o agendamento. Pode falar com nossa equipe?',
      error: error.message,
    }
  }

  let cancelMessage = '✅ Consulta cancelada com sucesso.'
  if (confirmTemplate && appointment?.starts_at) {
    const d = new Date(appointment.starts_at)
    cancelMessage = interpolate(confirmTemplate, {
      nome: appointment.patient_name ?? '',
      data: format(d, "EEE, dd/MM", { locale: ptBR }),
      horario: format(d, "HH'h'mm", { locale: ptBR }),
    })
  }
  return {
    success: true,
    id: appointmentId,
    message: cancelMessage,
  }
}

/**
 * Reschedule an appointment to a new slot.
 */
export async function rescheduleAppointment(params: {
  clinicId: string
  appointmentId: string
  slot: Slot
  confirmTemplate?: string
}): Promise<ActionResult> {
  const supabase = createAdminClient()

  const { data: appointment } = await supabase
    .from('appointments')
    .select('provider, provider_reference_id, patient_name, patient_phone')
    .eq('id', params.appointmentId)
    .eq('clinic_id', params.clinicId)
    .maybeSingle()

  let nextProviderReferenceId = appointment?.provider_reference_id || null

  if (appointment?.provider && appointment.provider !== 'manual') {
    const externalResult = await updateExternalAppointment({
      supabase,
      clinicId: params.clinicId,
      provider: appointment.provider,
      providerReferenceId: appointment.provider_reference_id,
      patientName: appointment.patient_name,
      patientPhone: appointment.patient_phone,
      startsAt: new Date(params.slot.startsAt),
      endsAt: new Date(params.slot.endsAt),
      description: 'Remarcado via WhatsApp',
    })

    if (!externalResult.synced) {
      return {
        success: false,
        message: externalResult.error || 'Não consegui remarcar na agenda integrada. Pode tentar novamente?',
        error: externalResult.error || 'external_reschedule_failed',
      }
    }

    nextProviderReferenceId = externalResult.providerReferenceId || nextProviderReferenceId
  }

  const { error } = await supabase
    .from('appointments')
    .update({
      starts_at: params.slot.startsAt,
      ends_at: params.slot.endsAt,
      status: 'scheduled',
      provider_reference_id: nextProviderReferenceId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.appointmentId)
    .eq('clinic_id', params.clinicId)

  if (error) {
    console.error('[bot/actions] rescheduleAppointment error:', error)
    return {
      success: false,
      message: 'Não consegui remarcar o agendamento. Pode tentar novamente?',
      error: error.message,
    }
  }

  const slotDate = new Date(params.slot.startsAt)
  const dataStr = format(slotDate, "EEE, dd/MM", { locale: ptBR })
  const horarioStr = format(slotDate, "HH'h'mm", { locale: ptBR })
  const rescheduleMessage = params.confirmTemplate
    ? interpolate(params.confirmTemplate, {
        nome: appointment?.patient_name ?? '',
        data: dataStr,
        horario: horarioStr,
      })
    : `✅ Consulta remarcada!\n\n📅 ${params.slot.label}\n\nSe precisar alterar novamente, é só me avisar. 😊`
  return {
    success: true,
    id: params.appointmentId,
    message: rescheduleMessage,
  }
}

/**
 * Fetch upcoming (active) appointments for a patient in a clinic.
 */
export async function getPatientAppointments(
  clinicId: string,
  patientPhone: string
): Promise<AppointmentSummary[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, status')
    .eq('clinic_id', clinicId)
    .eq('patient_phone', patientPhone)
    .in('status', ['scheduled', 'confirmed'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(5)

  if (error || !data) return []

  return data.map((a) => ({
    id: a.id,
    startsAt: a.starts_at,
    label: formatSlotLabel(new Date(a.starts_at)),
    status: a.status,
  }))
}

/**
 * Mark a conversation as waitlisted (no separate table needed for MVP).
 */
export async function addToWaitlist(
  clinicId: string,
  conversationId: string
): Promise<ActionResult> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('conversations')
    .update({ status: 'waitlist', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('clinic_id', clinicId)

  if (error) {
    console.error('[bot/actions] addToWaitlist error:', error)
    return { success: false, message: 'Erro ao entrar na lista de espera.', error: error.message }
  }

  return { success: true, message: 'Adicionado à lista de espera.' }
}

/**
 * Fetch conversations on the waitlist for a clinic.
 * Used by the waitlist processor to notify patients when a slot opens.
 */
export async function getWaitlistConversations(clinicId: string) {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('conversations')
    .select('id, patient_phone, patient_name')
    .eq('clinic_id', clinicId)
    .eq('status', 'waitlist')
    .order('updated_at', { ascending: true })

  return data ?? []
}
