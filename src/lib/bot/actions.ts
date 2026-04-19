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
  getBrazilianPhoneLookupCandidates,
  normalizeBrazilianPhone,
} from '@/lib/utils/phone'
import {
  confirmExternalAppointment,
  cancelExternalAppointment,
  createExternalAppointment,
  updateExternalAppointment,
} from '@/lib/integrations/integrationRouter'
import { GestaoDSService, GestaoDSServiceHelpers } from '@/lib/services/gestaods'
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
 * Only selects columns that are guaranteed to exist (migration 022).
 * buffer_time_minutes and min_advance_booking_hours are added by migration 023.
 */
async function getAppointmentSettings(clinicId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('appointment_settings')
    .select('default_duration_minutes, buffer_time_minutes, min_advance_booking_hours')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    // Columns may not exist yet (migration 023 pending) — fall back gracefully
    const { data: fallback } = await supabase
      .from('appointment_settings')
      .select('default_duration_minutes')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    return {
      durationMinutes: fallback?.default_duration_minutes ?? 30,
      bufferMinutes: 0,
      minAdvanceHours: 2,
    }
  }

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
  patientCpf?: string
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
    cpf: params.patientCpf,
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
      origin: 'bot_whatsapp',
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
  patientCpf?: string
  slot: Slot
  confirmTemplate?: string
  appointmentType?: 'particular' | 'convenio'
}): Promise<ActionResult> {
  const supabase = createAdminClient()

  console.log('[bot/actions] createAppointmentFromSlot started:', {
    patientName: params.patientName,
    patientPhone: params.patientPhone,
    hasCpf: !!params.patientCpf,
    cpfValue: params.patientCpf ? params.patientCpf.substring(0, 5) + '***' : undefined,
    appointmentType: params.appointmentType,
  })

  const externalResult = await createExternalAppointment({
    supabase,
    clinicId: params.clinicId,
    patientName: params.patientName,
    patientPhone: params.patientPhone,
    cpf: params.patientCpf,
    startsAt: new Date(params.slot.startsAt),
    endsAt: new Date(params.slot.endsAt),
    description: 'Agendamento via WhatsApp',
    conversationId: params.conversationId,
    appointmentType: params.appointmentType,
  })

  if (externalResult.provider !== 'none' && !externalResult.synced) {
    console.error('[bot/actions] External appointment failed:', {
      provider: externalResult.provider,
      error: externalResult.error,
    })
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
      origin: 'bot_whatsapp',
      provider: externalResult.synced ? externalResult.provider : 'manual',
      provider_reference_id: externalResult.providerReferenceId || null,
      description: 'Agendamento via WhatsApp',
      appointment_type: params.appointmentType || 'particular',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[bot/actions] createAppointmentFromSlot DB insert error:', error)
    return {
      success: false,
      message: 'Não consegui confirmar o agendamento. Pode tentar novamente?',
      error: error.message,
    }
  }

  console.log('[bot/actions] Appointment created successfully:', { appointmentId: data?.id })

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
 * Confirm attendance for an appointment.
 */
export async function confirmAppointmentAttendance(
  clinicId: string,
  appointmentId: string,
): Promise<ActionResult> {
  const supabase = createAdminClient()

  const { data: appointment } = await supabase
    .from('appointments')
    .select('provider, provider_reference_id, starts_at, patient_name')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (!appointment) {
    return {
      success: false,
      message: 'Não encontrei esse agendamento para confirmar.',
      error: 'appointment_not_found',
    }
  }

  if (appointment.provider && appointment.provider !== 'manual') {
    const externalResult = await confirmExternalAppointment({
      supabase,
      clinicId,
      provider: appointment.provider,
      providerReferenceId: appointment.provider_reference_id,
    })

    if (!externalResult.synced) {
      return {
        success: false,
        message: externalResult.error || 'Não consegui confirmar presença na agenda integrada.',
        error: externalResult.error || 'external_confirm_failed',
      }
    }
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)

  if (error) {
    console.error('[bot/actions] confirmAppointmentAttendance error:', error)
    return {
      success: false,
      message: 'Não consegui confirmar presença agora. Pode tentar novamente?',
      error: error.message,
    }
  }

  return {
    success: true,
    id: appointmentId,
    message: templatesNotAvailableFallbackConfirmMessage(appointment.starts_at),
  }
}

function templatesNotAvailableFallbackConfirmMessage(startsAt: string | null): string {
  if (!startsAt) return '✅ Presença confirmada com sucesso!'
  const d = new Date(startsAt)
  return `✅ Presença confirmada!\n\n📅 ${format(d, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}`
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
 * Normalize a Brazilian phone number to digits only, stripping country code 55.
 * e.g. "5511987654321" → "11987654321", "(11) 9 8765-4321" → "11987654321"
 */
function normalizePhone(phone: string): string {
  return normalizeBrazilianPhone(phone) || ''
}

function normalizeCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const digits = cpf.replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

export { normalizeCpf }

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const output = String(value).trim()
  return output.length > 0 ? output : null
}

function parseGestaoDSDate(raw: string): Date | null {
  if (!raw) return null

  if (raw.includes('-') && !raw.startsWith('0')) {
    const iso = new Date(raw)
    if (!Number.isNaN(iso.getTime())) return iso
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[\s T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return null

  const [, day, month, year, hours = '00', minutes = '00', seconds = '00'] = match
  const isoWithOffset = `${year}-${month}-${day}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}-03:00`
  const parsed = new Date(isoWithOffset)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function mapGestaoDSStatus(appt: Record<string, unknown>): string {
  if (appt.cancelado) return 'canceled'
  if (appt.faltou) return 'no_show'
  if (appt.finalizado) return 'completed'
  if (appt.confirmado) return 'confirmed'
  return 'scheduled'
}

async function resolvePatientCpf(clinicId: string, patientPhone: string): Promise<string | null> {
  const supabase = createAdminClient()
  const phoneCandidates = getBrazilianPhoneLookupCandidates(patientPhone)

  if (phoneCandidates.length === 0) return null

  const { data: latestConversations, error } = await supabase
    .from('conversations')
    .select('cpf, bot_context')
    .eq('clinic_id', clinicId)
    .in('patient_phone', phoneCandidates)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error?.code === 'PGRST204' && error.message?.includes("'cpf' column")) {
    const { data: fallbackConversations } = await supabase
      .from('conversations')
      .select('bot_context')
      .eq('clinic_id', clinicId)
      .in('patient_phone', phoneCandidates)
      .order('updated_at', { ascending: false })
      .limit(10)

    const fallbackConversationRecords = Array.isArray(fallbackConversations)
      ? fallbackConversations
      : fallbackConversations
        ? [fallbackConversations]
        : []

    for (const conversation of fallbackConversationRecords) {
      const cpfFromContext = normalizeCpf(
        conversation?.bot_context && typeof conversation.bot_context === 'object'
          ? String((conversation.bot_context as Record<string, unknown>).patientCpf || '')
          : null
      )

      if (cpfFromContext) return cpfFromContext
    }

    return null
  }

  const conversationRecords = Array.isArray(latestConversations)
    ? latestConversations
    : latestConversations
      ? [latestConversations]
      : []

  for (const conversation of conversationRecords) {
    const cpfFromColumn = normalizeCpf(conversation?.cpf)
    if (cpfFromColumn) return cpfFromColumn

    const cpfFromContext = normalizeCpf(
      conversation?.bot_context && typeof conversation.bot_context === 'object'
        ? String((conversation.bot_context as Record<string, unknown>).patientCpf || '')
        : null
    )

    if (cpfFromContext) return cpfFromContext
  }

  return null
}

async function upsertGestaoDSAppointmentMirror(params: {
  clinicId: string
  patientPhoneFallback: string
  sourceAppointment: Record<string, unknown>
}): Promise<AppointmentSummary | null> {
  const supabase = createAdminClient()
  const externalId = GestaoDSServiceHelpers.extractAppointmentId(params.sourceAppointment)

  if (!externalId) return null

  const startsAtRaw = normalizeString(
    params.sourceAppointment.data_agendamento ||
      params.sourceAppointment.data_hora_inicio ||
      params.sourceAppointment.starts_at
  )
  const endsAtRaw = normalizeString(
    params.sourceAppointment.data_fim_agendamento ||
      params.sourceAppointment.data_hora_fim ||
      params.sourceAppointment.ends_at
  )

  if (!startsAtRaw || !endsAtRaw) return null

  const startsAt = parseGestaoDSDate(startsAtRaw)
  const endsAt = parseGestaoDSDate(endsAtRaw)

  if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null
  }

  const patientNode =
    params.sourceAppointment.paciente && typeof params.sourceAppointment.paciente === 'object'
      ? (params.sourceAppointment.paciente as Record<string, unknown>)
      : {}

  const patientPhone =
    normalizeString(patientNode.celular || params.sourceAppointment.paciente_celular) ||
    normalizePhone(params.patientPhoneFallback)
  const payload = {
    patient_name:
      normalizeString(patientNode.nome || params.sourceAppointment.paciente_nome) ||
      'Paciente GestaoDS',
    patient_phone: patientPhone || params.patientPhoneFallback,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: mapGestaoDSStatus(params.sourceAppointment),
    updated_at: new Date().toISOString(),
  }

  const { data: existing, error: fetchExistingError } = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at, status, patient_name, patient_phone')
    .eq('clinic_id', params.clinicId)
    .eq('provider', 'gestaods')
    .eq('provider_reference_id', externalId)
    .maybeSingle()

  if (fetchExistingError) return null

  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from('appointments')
      .insert({
        clinic_id: params.clinicId,
        origin: 'external_import',
        provider: 'gestaods',
        provider_reference_id: externalId,
        ...payload,
      })
      .select('id')
      .single()

    if (insertError || !inserted?.id) return null

    return {
      id: inserted.id,
      startsAt: payload.starts_at,
      label: formatSlotLabel(startsAt),
      status: payload.status,
    }
  }

  const hasChanged =
    existing.starts_at !== payload.starts_at ||
    existing.ends_at !== payload.ends_at ||
    existing.status !== payload.status ||
    existing.patient_name !== payload.patient_name ||
    existing.patient_phone !== payload.patient_phone

  if (hasChanged) {
    const { error: updateError } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', existing.id)

    if (updateError) return null
  }

  return {
    id: existing.id,
    startsAt: payload.starts_at,
    label: formatSlotLabel(startsAt),
    status: payload.status,
  }
}

/**
 * Query the GestaoDS API for upcoming appointments matching the patient's CPF.
 * Missing appointments are mirrored locally so cancel/reschedule can reuse the DB flow.
 */
async function getPatientAppointmentsFromGestaoDSAPI(
  clinicId: string,
  patientPhone: string,
  patientCpf?: string | null,
): Promise<AppointmentSummary[]> {
  const supabase = createAdminClient()
  const cpf = normalizeCpf(patientCpf) || await resolvePatientCpf(clinicId, patientPhone)

  if (!cpf) return []

  const { data: integration } = await supabase
    .from('clinic_integrations')
    .select('gestaods_api_token, gestaods_is_dev')
    .eq('clinic_id', clinicId)
    .eq('provider', 'gestaods')
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration?.gestaods_api_token) return []

  const service = new GestaoDSService(
    integration.gestaods_api_token,
    integration.gestaods_is_dev ?? false
  )

  const result = await service.listPatientAppointments(cpf)

  if (!result.success || !result.data?.length) return []

  const appointments: AppointmentSummary[] = []
  const seen = new Set<string>()
  const now = Date.now()

  for (const appt of result.data) {
    if (!appt || typeof appt !== 'object') continue

    const summary = await upsertGestaoDSAppointmentMirror({
      clinicId,
      patientPhoneFallback: patientPhone,
      sourceAppointment: appt as Record<string, unknown>,
    })

    if (!summary || seen.has(summary.id)) continue
    if (!['scheduled', 'confirmed'].includes(summary.status)) continue
    if (new Date(summary.startsAt).getTime() < now) continue

    appointments.push(summary)
    seen.add(summary.id)
  }

  appointments.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return appointments
}

/**
 * Fetch upcoming (active) appointments for a patient in a clinic.
 * Merges local DB results with GestaoDS API results when integration is active.
 */
export async function getPatientAppointments(
  clinicId: string,
  patientPhone: string,
  patientCpf?: string | null,
): Promise<AppointmentSummary[]> {
  const supabase = createAdminClient()
  const phoneCandidates = getBrazilianPhoneLookupCandidates(patientPhone)

  if (phoneCandidates.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, status')
    .eq('clinic_id', clinicId)
    .in('patient_phone', phoneCandidates)
    .in('status', ['scheduled', 'confirmed'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(5)

  const localResults: AppointmentSummary[] = (error || !data)
    ? []
    : data.map((a) => ({
        id: a.id,
        startsAt: a.starts_at,
        label: formatSlotLabel(new Date(a.starts_at)),
        status: a.status,
      }))

  // Supplement with GestaoDS API (covers appointments synced with missing phone)
  const gestaoDSResults = await getPatientAppointmentsFromGestaoDSAPI(
    clinicId,
    patientPhone,
    patientCpf
  )

  if (gestaoDSResults.length === 0) return localResults

  // Merge — deduplicate by DB UUID
  const seen = new Set(localResults.map((a) => a.id))
  const merged = [...localResults]
  for (const a of gestaoDSResults) {
    if (!seen.has(a.id)) {
      merged.push(a)
      seen.add(a.id)
    }
  }

  merged.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return merged.slice(0, 5)
}

export async function hasGestaoDSIntegration(clinicId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('clinic_integrations')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('provider', 'gestaods')
    .eq('is_connected', true)
    .maybeSingle()

  return !!data
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
