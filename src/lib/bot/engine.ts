/**
 * Bot Engine — State Machine
 * Processes one patient message and returns the next bot response.
 *
 * All database operations go through actions.ts (no internal HTTP calls).
 * Slot availability is checked through availability.ts against real data.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { detectIntent, detectYesNo } from './intent'
import { templates } from './templates'
import {
  parseDayText,
  parseTimeText,
  formatSlotLabel,
  createAppointment,
  createAppointmentFromSlot,
  cancelAppointment,
  rescheduleAppointment,
  addToWaitlist,
} from './actions'
import { checkSlotAvailable, getAvailableDays, getAvailableSlots, getSlotsForDay } from './availability'
import { setHours, setMinutes, addMinutes } from 'date-fns'
import type { BotState, BotContext, Slot } from './context'
import type { BotSettings } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type { BotState, BotContext }

export type BotResponse = {
  message: string
  nextState: BotState
  nextContext: BotContext
  conversationStatus?: string
  transferToHuman?: boolean
  /** Optional message sent as a plain-text bubble BEFORE the interactive list */
  preambleMessage?: string
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Process one patient message through the state machine.
 *
 * @param conversationId  - DB id of the conversation
 * @param userMessage     - raw text sent by the patient
 * @param currentState    - current bot state (default: 'menu')
 * @param currentContext  - current bot context
 * @param botSettings     - clinic bot settings (working hours, messages, …)
 * @param patientPhone    - patient WhatsApp number (E.164)
 * @param clinicId        - clinic UUID (required for DB queries)
 */
export async function handleBotTurn(
  conversationId: string,
  userMessage: string,
  currentState: BotState = 'menu',
  currentContext: BotContext = {},
  botSettings?: BotSettings | null,
  patientPhone?: string,
  clinicId?: string
): Promise<BotResponse> {
  const state = currentState || 'menu'
  const ctx: BotContext = { ...currentContext, patientPhone: patientPhone ?? currentContext.patientPhone }

  switch (state) {
    case 'menu':
      return handleMenu(userMessage, ctx, botSettings, clinicId)

    case 'agendar_nome':
      return handleAgendarNome(userMessage, ctx, botSettings, clinicId)

    case 'agendar_dia':
      return handleAgendarDia(userMessage, ctx)

    case 'agendar_hora':
      return handleAgendarHora(conversationId, userMessage, ctx, botSettings, clinicId)

    case 'agendar_slot_escolha':
      return handleSlotEscolha(conversationId, userMessage, ctx, clinicId, 'agendar', botSettings)

    case 'agendar_dia_lista':
      return handleAgendarDiaLista(userMessage, ctx, botSettings, clinicId)

    case 'agendar_hora_lista':
      return handleAgendarHoraLista(conversationId, userMessage, ctx, botSettings, clinicId)

    case 'reagendar_qual':
      return handleQualAppointment(userMessage, ctx, 'reagendar', botSettings, clinicId)

    case 'reagendar_dia':
      return handleReagendarDia(userMessage, ctx)

    case 'reagendar_hora':
      return handleReagendarHora(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_slot_escolha':
      return handleSlotEscolha(conversationId, userMessage, ctx, clinicId, 'reagendar', botSettings)

    case 'reagendar_dia_lista':
      return handleReagendarDiaLista(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_hora_lista':
      return handleReagendarHoraLista(conversationId, userMessage, ctx, botSettings, clinicId)

    case 'cancelar_qual':
      return handleQualAppointment(userMessage, ctx, 'cancelar', botSettings, clinicId)

    case 'cancelar_confirmar':
      return handleCancelarConfirmar(userMessage, ctx)

    case 'cancelar_encaixe':
      return handleCancelarEncaixe(conversationId, userMessage, ctx, clinicId, botSettings)

    case 'atendente':
      return {
        message: botSettings?.message_menu || templates.menu,
        nextState: 'menu',
        nextContext: {},
      }

    case 'ver_agendamentos':
      return handleVerAgendamentosResposta(userMessage, ctx)

    case 'confirmar_presenca':
      return handleConfirmarPresenca(userMessage, ctx)

    default:
      return {
        message: botSettings?.message_fallback || templates.notUnderstood,
        nextState: 'menu',
        nextContext: {},
      }
  }
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

async function handleMenu(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (isGreetingMessage(msg)) {
    return {
      preambleMessage: botSettings?.message_welcome || undefined,
      message: botSettings?.message_menu || templates.menu,
      nextState: 'menu',
      nextContext: ctx,
    }
  }

  const intent = detectIntent(msg)

  switch (intent) {
    case 'schedule':
      if (!ctx.patientName) {
        return { message: templates.scheduleAskName, nextState: 'agendar_nome', nextContext: { ...ctx, intent: 'schedule' } }
      }

      return showDayList({
        clinicId,
        botSettings,
        ctx: { ...ctx, intent: 'schedule' },
        flow: 'agendar',
        offset: 0,
      })

    case 'reschedule':
      return {
        message: '🔍 Buscando suas consultas para remarcar...',
        nextState: 'ver_agendamentos',
        nextContext: { ...ctx, intent: 'reschedule' },
      }

    case 'cancel':
      return { message: templates.cancelConfirmGeneric, nextState: 'cancelar_confirmar', nextContext: { ...ctx, intent: 'cancel' } }

    case 'attendant':
      return {
        message: botSettings?.message_menu
          ? templates.attendantTransfer
          : templates.attendantTransfer,
        nextState: 'atendente',
        nextContext: { ...ctx, intent: 'attendant' },
        conversationStatus: 'waiting_human',
        transferToHuman: true,
      }

    case 'view_appointments':
      return {
        message: '🔍 Buscando seus agendamentos...',
        nextState: 'ver_agendamentos',
        nextContext: { ...ctx, intent: 'view_appointments' },
      }

    case 'confirm_attendance':
      return { message: templates.confirmAttendanceAsk, nextState: 'confirmar_presenca', nextContext: { ...ctx, intent: 'confirm_attendance' } }

    default:
      return {
        message: botSettings?.message_fallback || templates.notUnderstood,
        nextState: 'menu',
        nextContext: ctx,
      }
  }
}

function isGreetingMessage(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (!normalized) return false

  return /\b(oi|ola|bom dia|boa tarde|boa noite|opa|e ai|hey)\b/.test(normalized)
}

// ---- Agendar ---------------------------------------------------------------

async function handleAgendarNome(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const name = msg.trim()
  return showDayList({
    clinicId,
    botSettings,
    ctx: { ...ctx, patientName: name },
    flow: 'agendar',
    offset: 0,
  })
}

function handleAgendarDia(msg: string, ctx: BotContext): BotResponse {
  return {
    message: templates.scheduleAskTime(msg.trim()),
    nextState: 'agendar_hora',
    nextContext: { ...ctx, requestedDay: msg.trim() },
  }
}

async function handleAgendarHora(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string
): Promise<BotResponse> {
  if (!clinicId) return technicalError(ctx)

  const requestedDay = ctx.requestedDay || ''
  const requestedTime = msg.trim()

  // Try to parse and create directly
  const result = await createAppointment({
    clinicId,
    conversationId,
    patientName: ctx.patientName || 'Paciente',
    patientPhone: ctx.patientPhone || '',
    dayText: requestedDay,
    timeText: requestedTime,
    confirmTemplate: botSettings?.message_confirm_schedule,
  })

  // Success
  if (result.success) {
    return {
      message: result.message,
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'scheduled',
    }
  }

  // Parsing errors — ask again
  if (result.error === 'invalid_date') {

    return { message: result.message, nextState: 'agendar_dia', nextContext: ctx }
  }
  if (result.error === 'invalid_time' || result.error === 'too_soon') {
    return { message: result.message, nextState: 'agendar_hora', nextContext: { ...ctx, requestedTime } }
  }

  // Conflict — offer real available slots
  if (botSettings && result.error !== 'db_error') {
    const parsedDate = parseDayText(requestedDay)
    if (parsedDate) {
      const slots = await getAvailableSlots(clinicId, parsedDate, botSettings, 3)
      if (slots.length > 0) {
        return {
          message: templates.scheduleConflict(slots),
          nextState: 'agendar_slot_escolha',
          nextContext: { ...ctx, requestedTime, availableSlots: slots },
        }
      }
    }
    return { message: templates.scheduleNoSlots, nextState: 'menu', nextContext: {} }
  }

  return technicalError(ctx)
}

async function handleSlotEscolha(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  clinicId: string | undefined,
  flow: 'agendar' | 'reagendar',
  botSettings?: BotSettings | null
): Promise<BotResponse> {
  if (!clinicId) return technicalError(ctx)

  const slots = ctx.availableSlots ?? []
  const choice = resolveChoiceIndex(msg, slots.map(slot => slot.label))

  if (choice < 0 || choice >= slots.length) {
    return {
      message: templates.invalidChoice(slots.length),
      nextState: flow === 'agendar' ? 'agendar_slot_escolha' : 'reagendar_slot_escolha',
      nextContext: ctx,
    }
  }

  const slot = slots[choice]

  if (flow === 'agendar') {
    const result = await createAppointmentFromSlot({
      clinicId,
      conversationId,
      patientName: ctx.patientName || 'Paciente',
      patientPhone: ctx.patientPhone || '',
      slot,
      confirmTemplate: botSettings?.message_confirm_schedule,
    })
    return {
      message: result.message,
      nextState: result.success ? 'menu' : 'agendar_slot_escolha',
      nextContext: result.success ? {} : ctx,
      conversationStatus: result.success ? 'scheduled' : undefined,
    }
  }

  // reagendar
  if (!ctx.appointmentId) return technicalError(ctx)
  const result = await rescheduleAppointment({
    clinicId,
    appointmentId: ctx.appointmentId,
    slot,
    confirmTemplate: botSettings?.message_confirm_reschedule,
  })
  return {
    message: result.message,
    nextState: result.success ? 'menu' : 'reagendar_slot_escolha',
    nextContext: result.success ? {} : ctx,
    conversationStatus: result.success ? 'scheduled' : undefined,
  }
}

// ---- Reagendar -------------------------------------------------------------

async function handleQualAppointment(
  msg: string,
  ctx: BotContext,
  flow: 'cancelar' | 'reagendar',
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const appointments = ctx.appointments ?? []
  const choice = resolveChoiceIndex(msg, appointments.map(appointment => appointment.label))

  if (choice < 0 || choice >= appointments.length) {
    return {
      message: templates.invalidChoice(appointments.length),
      nextState: flow === 'cancelar' ? 'cancelar_qual' : 'reagendar_qual',
      nextContext: ctx,
    }
  }

  const chosen = appointments[choice]

  if (flow === 'cancelar') {
    return {
      message: templates.cancelConfirmSingle(chosen.label),
      nextState: 'cancelar_confirmar',
      nextContext: { ...ctx, appointmentId: chosen.id },
    }
  }

  return showDayList({
    clinicId,
    botSettings,
    ctx: { ...ctx, appointmentId: chosen.id },
    flow: 'reagendar',
    offset: 0,
  })
}

function handleReagendarDia(msg: string, ctx: BotContext): BotResponse {
  return {
    message: templates.rescheduleAskTime(msg.trim()),
    nextState: 'reagendar_hora',
    nextContext: { ...ctx, requestedDay: msg.trim() },
  }
}

async function handleReagendarHora(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string
): Promise<BotResponse> {
  if (!clinicId || !ctx.appointmentId) return technicalError(ctx)

  const requestedDay = ctx.requestedDay || ''
  const requestedTime = msg.trim()

  const parsedDate = parseDayText(requestedDay)
  const parsedTime = parseTimeText(requestedTime)

  if (!parsedDate) {
    return { message: 'Não consegui entender a data. Pode repetir? (ex: segunda-feira, 28/04)', nextState: 'reagendar_dia', nextContext: ctx }
  }
  if (!parsedTime) {
    return { message: 'Não consegui entender o horário. Pode repetir? (ex: 14h, 14:30)', nextState: 'reagendar_hora', nextContext: { ...ctx, requestedTime } }
  }

  const durationMinutes = 30 // will be fetched from settings in availability service
  const startsAt = setMinutes(setHours(parsedDate, parsedTime.hours), parsedTime.minutes)
  const endsAt = addMinutes(startsAt, durationMinutes)

  if (botSettings) {
    const available = await checkSlotAvailable(clinicId, startsAt, endsAt, botSettings)
    if (!available) {
      const slots = await getAvailableSlots(clinicId, parsedDate, botSettings, 3)
      if (slots.length > 0) {
        return {
          message: templates.rescheduleConflict(slots),
          nextState: 'reagendar_slot_escolha',
          nextContext: { ...ctx, requestedTime, availableSlots: slots },
        }
      }
      return { message: templates.scheduleNoSlots, nextState: 'menu', nextContext: {} }
    }
  }

  const slot: Slot = {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    label: formatSlotLabel(startsAt),
  }

  const result = await rescheduleAppointment({
    clinicId,
    appointmentId: ctx.appointmentId,
    slot,
    confirmTemplate: botSettings?.message_confirm_reschedule,
  })
  return {
    message: result.message,
    nextState: result.success ? 'menu' : 'reagendar_hora',
    nextContext: result.success ? {} : ctx,
    conversationStatus: result.success ? 'scheduled' : undefined,
  }
}

// ---- Cancelar --------------------------------------------------------------

function handleCancelarConfirmar(msg: string, ctx: BotContext): BotResponse {
  const answer = detectYesNo(msg)

  if (answer === 'yes') {
    return {
      message: templates.cancelAskWaitlist,
      nextState: 'cancelar_encaixe',
      nextContext: ctx,
    }
  }

  if (answer === 'no') {
    return { message: templates.cancelAborted, nextState: 'menu', nextContext: {} }
  }

  return { message: templates.cancelConfirmGeneric, nextState: 'cancelar_confirmar', nextContext: ctx }
}

async function handleCancelarEncaixe(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  clinicId?: string,
  botSettings?: BotSettings | null
): Promise<BotResponse> {
  const answer = detectYesNo(msg)

  if (answer === 'unknown') {
    return { message: templates.cancelAskWaitlist, nextState: 'cancelar_encaixe', nextContext: ctx }
  }

  // Cancel the appointment in DB
  if (ctx.appointmentId && clinicId) {
    await cancelAppointment(clinicId, ctx.appointmentId, botSettings?.message_confirm_cancel)
  }

  if (answer === 'yes') {
    if (clinicId) await addToWaitlist(clinicId, conversationId)
    return {
      message: templates.cancelWithWaitlist,
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'waitlist',
    }
  }

  return {
    message: templates.cancelWithoutWaitlist,
    nextState: 'menu',
    nextContext: {},
    conversationStatus: 'canceled',
  }
}

// ---- Ver agendamentos ------------------------------------------------------

async function handleVerAgendamentosResposta(
  msg: string,
  ctx: BotContext
): Promise<BotResponse> {
  // This state is entered right after "ver agendamentos" intent is detected.
  // The FIRST call here should fetch and display appointments.
  // Subsequent calls handle the patient's choice (remarcar / cancelar / menu).
  //
  // We detect this by checking if appointments are already in context.
  if (!ctx.appointments) {
    // First entry — appointments haven't been fetched yet (fetched in the engine
    // right before this state is reached, but we handle it here for safety).
    return {
      message: templates.viewAppointmentsNotFound,
      nextState: 'menu',
      nextContext: {},
    }
  }

  const intent = detectIntent(msg)
  const num = parseInt(msg.trim(), 10)

  if (intent === 'reschedule' || num === 1) {
    if (ctx.appointments.length > 1) {
      return {
        message: templates.whichAppointmentReschedule(ctx.appointments),
        nextState: 'reagendar_qual',
        nextContext: { ...ctx, intent: 'reschedule' },
      }
    }

    return {
      message: templates.whichAppointmentReschedule(ctx.appointments),
      nextState: 'reagendar_qual',
      nextContext: { ...ctx, intent: 'reschedule' },
    }
  }

  if (intent === 'cancel' || num === 2) {
    if (ctx.appointments.length > 1) {
      return {
        message: templates.whichAppointmentCancel(ctx.appointments),
        nextState: 'cancelar_qual',
        nextContext: { ...ctx, intent: 'cancel' },
      }
    }

    return {
      message: templates.cancelConfirmSingle(ctx.appointments[0].label),
      nextState: 'cancelar_confirmar',
      nextContext: { ...ctx, intent: 'cancel', appointmentId: ctx.appointments[0].id },
    }
  }

  return { message: templates.menu, nextState: 'menu', nextContext: {} }
}

// ---- Confirmar presença ----------------------------------------------------

function handleConfirmarPresenca(msg: string, ctx: BotContext): BotResponse {
  const answer = detectYesNo(msg)

  if (answer === 'yes') {
    return {
      message: templates.confirmAttendanceSuccess,
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'scheduled',
    }
  }

  if (answer === 'no') {
    return { message: templates.confirmAttendanceCancel, nextState: 'menu', nextContext: {} }
  }

  return { message: templates.confirmAttendanceAsk, nextState: 'confirmar_presenca', nextContext: ctx }
}

// ---------------------------------------------------------------------------
// Send bot response + persist state
// ---------------------------------------------------------------------------

/**
 * Send the bot message via Z-API and persist the new state to the database.
 */
export async function sendBotResponse(
  conversationId: string,
  phone: string,
  response: BotResponse,
  clinicId: string
): Promise<boolean> {
  const supabase = createAdminClient()
  const interactive = extractInteractiveChoices(response.message)
  const zapiUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/zapi/send-text`
  const zapiHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  }

  const zapiSend = async (payload: Record<string, unknown>) => {
    const res = await fetch(zapiUrl, { method: 'POST', headers: zapiHeaders, body: JSON.stringify(payload) })
    if (!res.ok) {
      console.error('[Bot] Failed to send message via Z-API:', await res.text())
      return false
    }
    return true
  }

  try {
    // 1. Send via Z-API
    if (interactive && interactive.choices.length >= 2) {
      // Optional preamble (e.g. welcome message) sent as plain text first
      if (response.preambleMessage?.trim()) {
        const ok = await zapiSend({ conversationId, phone, text: response.preambleMessage.trim(), internalCall: true })
        if (!ok) return false
        await new Promise(r => setTimeout(r, 400))
      }
      // Single interactive list bubble: cleanedMessage is the list context text
      const listText = interactive.message.trim() || 'Escolha uma opção:'
      const ok = await zapiSend({
        conversationId,
        phone,
        text: listText,
        choices: interactive.choices,
        choicesTitle: interactive.title,
        internalCall: true,
      })
      if (!ok) return false
    } else {
      // No interactive choices — send as a single plain-text message
      const ok = await zapiSend({ conversationId, phone, text: response.message, internalCall: true })
      if (!ok) return false
    }

    // 2. Save bot message
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'bot',
      content: response.message,
      created_at: new Date().toISOString(),
    })

    if (msgError) {
      console.error('[Bot] Failed to save bot message:', msgError)
      return false
    }

    // 3. Update conversation state
    const update: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: response.message.substring(0, 100),
      bot_state: response.nextState,
      bot_context: response.nextContext,
    }

    if (response.conversationStatus) update.status = response.conversationStatus
    if (response.transferToHuman) update.bot_enabled = false

    const { error: convError } = await supabase
      .from('conversations')
      .update(update)
      .eq('id', conversationId)

    if (convError) {
      console.error('[Bot] Failed to update conversation:', convError)
      return false
    }

    // 4. Create in-app alert when the bot transfers the conversation to human
    if (response.transferToHuman) {
      try {
        const { data: conversation } = await supabase
          .from('conversations')
          .select('patient_name')
          .eq('id', conversationId)
          .single()

        const patientLabel = conversation?.patient_name || phone

        await supabase.from('notifications').insert({
          clinic_id: clinicId,
          type: 'conversation_waiting',
          title: 'Bot solicitou atendimento humano',
          message: `A conversa com ${patientLabel} foi transferida para humano e está aguardando ação.`,
          link: `/dashboard/conversas?id=${conversationId}`,
          conversation_id: conversationId,
        })
      } catch (notificationError) {
        // Non-blocking: message delivery/state update should succeed even if alert fails.
        console.error('[Bot] Failed to create handoff notification:', notificationError)
      }
    }

    // 5. Log bot response activity
    await supabase.from('logs').insert({
      clinic_id: clinicId,
      event: 'bot.response.sent',
      level: 'info',
      metadata: {
        conversationId,
        state: response.nextState,
        statusChange: response.conversationStatus,
        transferToHuman: response.transferToHuman || false,
      },
    })

    return true
  } catch (error) {
    console.error('[Bot] Error in sendBotResponse:', error)

    try {
      await supabase.from('logs').insert({
        clinic_id: clinicId,
        event: 'bot.response.failed',
        level: 'error',
        metadata: {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    } catch {
      // ignore logging errors
    }

    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// List-based scheduling handlers
// ---------------------------------------------------------------------------

const DAY_LIST_PAGE_SIZE = 8

async function showDayList(params: {
  clinicId?: string
  botSettings?: BotSettings | null
  ctx: BotContext
  flow: 'agendar' | 'reagendar'
  offset: number
}): Promise<BotResponse> {
  if (!params.clinicId || !params.botSettings) return technicalError(params.ctx)

  // Fetch one extra day to detect if there are more pages
  const days = await getAvailableDays(
    params.clinicId,
    params.botSettings,
    new Date(),
    DAY_LIST_PAGE_SIZE + 1,
    params.offset,
  )

  if (days.length === 0) {
    return { message: templates.scheduleNoSlots, nextState: 'menu', nextContext: {} }
  }

  const hasMore = days.length > DAY_LIST_PAGE_SIZE
  const page = days.slice(0, DAY_LIST_PAGE_SIZE)

  const message =
    params.flow === 'agendar'
      ? templates.scheduleDayList(page, hasMore)
      : templates.rescheduleDayList(page, hasMore)

  return {
    message,
    nextState: params.flow === 'agendar' ? 'agendar_dia_lista' : 'reagendar_dia_lista',
    nextContext: {
      ...params.ctx,
      availableDays: page,
      dayListOffset: params.offset,
    },
  }
}

async function handleAgendarDiaLista(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const days = ctx.availableDays ?? []
  const normalizedMsg = normalizeChoiceText(msg)

  // "Ver mais datas" option
  if (normalizedMsg.includes('mais datas') || normalizedMsg.includes('ver mais')) {
    return showDayList({ clinicId, botSettings, ctx, flow: 'agendar', offset: (ctx.dayListOffset ?? 0) + DAY_LIST_PAGE_SIZE })
  }

  const choice = resolveChoiceIndex(msg, days.map(d => d.label))

  if (choice < 0 || choice >= days.length) {
    return {
      message: templates.invalidChoice(days.length),
      nextState: 'agendar_dia_lista',
      nextContext: ctx,
    }
  }

  const selectedDay = days[choice]
  const slots = await getSlotsForDay(clinicId, selectedDay.date, botSettings)

  if (slots.length === 0) {
    return { message: templates.scheduleNoSlots, nextState: 'menu', nextContext: {} }
  }

  return {
    message: templates.scheduleSlotList(selectedDay.label, slots, true),
    nextState: 'agendar_hora_lista',
    nextContext: {
      ...ctx,
      selectedDay: selectedDay.date,
      selectedDayLabel: selectedDay.label,
      availableSlots: slots,
    },
  }
}

async function handleAgendarHoraLista(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const slots = ctx.availableSlots ?? []
  const normalizedMsg = normalizeChoiceText(msg)

  // "Outra data" option
  if (normalizedMsg.includes('outra data') || normalizedMsg.includes('voltar')) {
    return showDayList({ clinicId, botSettings, ctx, flow: 'agendar', offset: ctx.dayListOffset ?? 0 })
  }

  const choice = resolveChoiceIndex(msg, slots.map(s => s.label))

  if (choice < 0 || choice >= slots.length) {
    return {
      message: templates.invalidChoice(slots.length),
      nextState: 'agendar_hora_lista',
      nextContext: ctx,
    }
  }

  const slot = slots[choice]
  const result = await createAppointmentFromSlot({
    clinicId,
    conversationId,
    patientName: ctx.patientName || 'Paciente',
    patientPhone: ctx.patientPhone || '',
    slot,
    confirmTemplate: botSettings?.message_confirm_schedule,
  })

  return {
    message: result.message,
    nextState: result.success ? 'menu' : 'agendar_hora_lista',
    nextContext: result.success ? {} : ctx,
    conversationStatus: result.success ? 'scheduled' : undefined,
  }
}

async function handleReagendarDiaLista(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const days = ctx.availableDays ?? []
  const normalizedMsg = normalizeChoiceText(msg)

  if (normalizedMsg.includes('mais datas') || normalizedMsg.includes('ver mais')) {
    return showDayList({ clinicId, botSettings, ctx, flow: 'reagendar', offset: (ctx.dayListOffset ?? 0) + DAY_LIST_PAGE_SIZE })
  }

  const choice = resolveChoiceIndex(msg, days.map(d => d.label))

  if (choice < 0 || choice >= days.length) {
    return {
      message: templates.invalidChoice(days.length),
      nextState: 'reagendar_dia_lista',
      nextContext: ctx,
    }
  }

  const selectedDay = days[choice]
  const slots = await getSlotsForDay(clinicId, selectedDay.date, botSettings)

  if (slots.length === 0) {
    return { message: templates.scheduleNoSlots, nextState: 'menu', nextContext: {} }
  }

  return {
    message: templates.rescheduleSlotList(selectedDay.label, slots, true),
    nextState: 'reagendar_hora_lista',
    nextContext: {
      ...ctx,
      selectedDay: selectedDay.date,
      selectedDayLabel: selectedDay.label,
      availableSlots: slots,
    },
  }
}

async function handleReagendarHoraLista(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings || !ctx.appointmentId) return technicalError(ctx)

  const slots = ctx.availableSlots ?? []
  const normalizedMsg = normalizeChoiceText(msg)

  if (normalizedMsg.includes('outra data') || normalizedMsg.includes('voltar')) {
    return showDayList({ clinicId, botSettings, ctx, flow: 'reagendar', offset: ctx.dayListOffset ?? 0 })
  }

  const choice = resolveChoiceIndex(msg, slots.map(s => s.label))

  if (choice < 0 || choice >= slots.length) {
    return {
      message: templates.invalidChoice(slots.length),
      nextState: 'reagendar_hora_lista',
      nextContext: ctx,
    }
  }

  const slot = slots[choice]
  const result = await rescheduleAppointment({
    clinicId,
    appointmentId: ctx.appointmentId,
    slot,
    confirmTemplate: botSettings?.message_confirm_reschedule,
  })

  return {
    message: result.message,
    nextState: result.success ? 'menu' : 'reagendar_hora_lista',
    nextContext: result.success ? {} : ctx,
    conversationStatus: result.success ? 'scheduled' : undefined,
  }
}

function technicalError(ctx: BotContext): BotResponse {
  return {
    message: templates.technicalError,
    nextState: 'menu',
    nextContext: ctx,
  }
}

async function offerSlotSelection(params: {
  clinicId?: string
  botSettings?: BotSettings | null
  ctx: BotContext
  flow: 'agendar' | 'reagendar'
}): Promise<BotResponse> {
  if (!params.clinicId || !params.botSettings) {
    return technicalError(params.ctx)
  }

  const slots = await getAvailableSlots(params.clinicId, new Date(), params.botSettings, 5)
  if (slots.length === 0) {
    return { message: templates.scheduleNoSlots, nextState: 'menu', nextContext: {} }
  }

  return {
    message:
      params.flow === 'agendar'
        ? templates.scheduleChooseSlot(slots)
        : templates.rescheduleChooseSlot(slots),
    nextState: params.flow === 'agendar' ? 'agendar_slot_escolha' : 'reagendar_slot_escolha',
    nextContext: { ...params.ctx, availableSlots: slots },
  }
}

function resolveChoiceIndex(message: string, options: string[]): number {
  const normalizedMessage = normalizeChoiceText(message)
  const numericChoice = parseInt(normalizedMessage, 10)

  if (!Number.isNaN(numericChoice) && numericChoice >= 1 && numericChoice <= options.length) {
    return numericChoice - 1
  }

  return options.findIndex(option => normalizeChoiceText(option) === normalizedMessage)
}

function normalizeChoiceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

type InteractiveChoice = {
  id: string
  label: string
}

function extractInteractiveChoices(
  message: string,
): { message: string; choices: InteractiveChoice[]; title: string } | null {
  // Normalize emoji number format before parsing.
  // "1️⃣" = U+0031 + U+FE0F (variation selector) + U+20E3 (combining enclosing keycap).
  // The variation selector (U+FE0F) may be absent depending on the source, so it's optional.
  // We convert "1️⃣" → "1. " so the standard separator regex works uniformly.
  const normalizeEmoji = (s: string) => s.replace(/(\d+)\uFE0F?\u20E3/g, '$1. ')

  const lines = message
    .split('\n')
    .map(line => normalizeEmoji(line.trim()))
    .filter(Boolean)

  // Matches lines like: "1. Option", "1) Option", "1: Option", "1- Option"
  const choiceLineRegex = /^(\d+)[.):-]\s+(.+)$/
  // Matches inline choices on the same line: "1. Opt1   2. Opt2"
  const inlineChoiceRegex = /(\d+)[.):-]\s+([^\n\r]+?)(?=\s+\d+[.):-]\s+|$)/g

  const collected: InteractiveChoice[] = []

  const consumeLabel = (raw: string): string => {
    let label = raw.trim().replace(/^[-•\s]+/, '')
    label = label.replace(/\s{2,}/g, ' ').trim()
    return label
  }

  for (const line of lines) {
    const lineMatch = line.match(choiceLineRegex)
    if (lineMatch) {
      const id = lineMatch[1]
      const label = consumeLabel(lineMatch[2])
      if (label) collected.push({ id, label })
      continue
    }

    const matches = [...line.matchAll(inlineChoiceRegex)]
    for (const match of matches) {
      const id = String(match[1] || '').trim()
      const label = consumeLabel(String(match[2] || ''))
      if (id && label) collected.push({ id, label })
    }
  }

  const deduped = collected.filter(
    (choice, index, arr) =>
      arr.findIndex(item => item.id === choice.id || item.label === choice.label) === index,
  )

  if (deduped.length < 2) return null

  const inlineChoiceLinePattern = /\d+[.):-]\s+.+\d+[.):-]\s+/
  const cleanedLines = lines.filter(
    line => !choiceLineRegex.test(line) && !inlineChoiceLinePattern.test(line),
  )
  const cleanedMessage = cleanedLines.join('\n').trim()

  return {
    message: cleanedMessage.length > 0 ? cleanedMessage : 'Escolha uma opção:',
    choices: deduped,
    title: 'Opções disponíveis',
  }
}
