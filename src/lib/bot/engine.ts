/**
 * Bot Engine — State Machine
 * Processes one patient message and returns the next bot response.
 *
 * All database operations go through actions.ts (no internal HTTP calls).
 * Slot availability is checked through availability.ts against real data.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/services/notificationService'
import { sendInternalZapiMessage } from '@/lib/zapi/internalSend'
import { detectIntent, detectYesNo } from './intent'
import { templates } from './templates'
import {
  parseDayText,
  parseTimeText,
  formatSlotLabel,
  createAppointment,
  createAppointmentFromSlot,
  confirmAppointmentAttendance,
  cancelAppointment,
  rescheduleAppointment,
  addToWaitlist,
  addToWaitlistWithPreference,
  notifyWaitlistOnSlotFree,
  getPatientAppointments,
  hasGestaoDSIntegration,
  normalizeCpf,
} from './actions'
import { checkSlotAvailable, getAvailableDays, getAvailableSlots, getSlotsForDay } from './availability'
import { setHours, setMinutes, addMinutes, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
  /** CPF to save directly to conversation.cpf column */
  patientCpf?: string
  /** Optional message sent as a plain-text bubble BEFORE the interactive list */
  preambleMessage?: string
  /** Optional second message sent AFTER the main message (e.g. menu after an alert) */
  followUpMessage?: string
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

  // Media intercept — audio/video cannot be processed by the bot.
  // Send alert with secretary button, then the menu as a second message.
  if (userMessage === '[Áudio]' || userMessage === '[Vídeo]') {
    return {
      message: `Olá! 😊 Recebi seu áudio, mas estou como *assistente virtual* e ainda não consigo escutar mensagens de voz.\n\nSe preferir, posso chamar uma secretária:\n\n1️⃣ Aguardar uma secretária`,
      followUpMessage: buildMenuMessage(botSettings),
      nextState: 'audio_recebido',
      nextContext: ctx,
    }
  }

  // Universal escape hatch — runs in ANY non-terminal state.
  // Handles two cases:
  //   a) "Voltar ao menu" / "menu" / "voltar" → go to menu
  //   b) "Sim, falar com secretária" / "secretária" / "1" (when in sem_horario) → transfer
  // This catches timing races where the patient clicked a scheduleNoSlots button
  // BEFORE the DB had persisted 'sem_horario' as the new state.
  if (state !== 'atendente') {
    const escapedMsg = userMessage
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

    const menuChoiceIndex = getMenuChoiceIndex(state, ctx)

    // "Voltar ao menu" button or typed menu/voltar
    const isBackToMenu = /^(menu|inicio|ajuda|help|sair|cancelar tudo|0)$/.test(escapedMsg)
      || /\bvoltar\b/.test(escapedMsg)
      || /\bvoltar ao menu\b/.test(escapedMsg)
      || /\bmenu principal\b/.test(escapedMsg)
      || (menuChoiceIndex !== null && matchesChoiceSelection(escapedMsg, menuChoiceIndex))

    // "Sim, falar com secretária" button — only outside menu/agendar_nome states
    // where "1" or "sim" would be ambiguous
    const isAttendantRequest = state !== 'menu' && (
      /sim.*falar.*atendente|falar.*atendente|quero.*atendente|sim.*falar.*secretaria|falar.*secretaria|quero.*secretaria/i.test(escapedMsg) ||
      /option[_-]?1|button[_-]?1/.test(escapedMsg) ||
      (state === 'sem_horario' && (escapedMsg === '1' || /^sim$/.test(escapedMsg))) ||
      (state === 'lista_espera_faixa' && false) // list_espera_faixa handled in its own switch case
    )

    if (isBackToMenu) {
      return {
        preambleMessage: undefined,
        message: buildMenuMessage(botSettings),
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
      }
    }

    if (isAttendantRequest) {
      return {
        message: templates.attendantTransfer,
        nextState: 'atendente',
        nextContext: ctx,
        conversationStatus: 'waiting_human',
        transferToHuman: true,
      }
    }
  }

  switch (state) {
    case 'menu':
      return handleMenu(userMessage, ctx, botSettings, clinicId)

    case 'agendar_para_quem':
      return handleAgendarParaQuem(userMessage, ctx)

    case 'agendar_quantos':
      return handleAgendarQuantos(userMessage, ctx)

    case 'agendar_tipo':
      return handleAgendarTipo(userMessage, ctx, botSettings, clinicId)

    case 'agendar_convenio':
      return handleAgendarConvenio(userMessage, ctx, botSettings, clinicId)

    case 'convenio_aguardando_carteirinha':
      return handleConvenioAguardandoCarteirinha(ctx)

    case 'convenio_sem_cadastro':
      return handleConvenioSemCadastro(userMessage, ctx, botSettings)

    case 'agendar_nome':
      return handleAgendarNome(userMessage, ctx, botSettings, clinicId)

    case 'agendar_cpf':
      return handleAgendarCpf(conversationId, userMessage, ctx, botSettings, clinicId)

    case 'consultar_cpf':
      return handleConsultarCpf(userMessage, ctx, botSettings, clinicId)

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

    case 'agendar_confirmar':
      return handleAgendarConfirmar(conversationId, userMessage, ctx, botSettings, clinicId)

    case 'agendar_alterar_campo':
      return handleAgendarAlterarCampo(userMessage, ctx, botSettings, clinicId)

    case 'agendar_alterar_paciente':
      return handleAgendarAlterarPaciente(userMessage, ctx, botSettings, clinicId)

    case 'agendar_sem_slots_convenio':
      return await handleAgendarSemSlotsConvenio(userMessage, ctx, botSettings, clinicId)

    case 'agendar_exame_tipo':
      return handleAgendarExameTipo(userMessage, ctx, botSettings, clinicId)

    case 'agendar_exame_convenio':
      return handleAgendarExameConvenio(userMessage, ctx, botSettings, clinicId)

    case 'agendar_exame_sem_slots_convenio':
      return await handleAgendarExameSemSlotsConvenio(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_qual':
      return handleQualAppointment(userMessage, ctx, 'reagendar', botSettings, clinicId)

    case 'reagendar_manter_tipo':
      return handleReagendarManterTipo(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_convenio':
      return handleReagendarConvenio(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_tipo':
      return handleReagendarTipo(userMessage, ctx, botSettings, clinicId)

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

    case 'reagendar_sem_slots_convenio':
      return await handleReagendarSemSlotsConvenio(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_exame_qual':
      return handleQualExame(userMessage, ctx, 'reagendar', botSettings, clinicId)

    case 'reagendar_exame_manter_tipo':
      return handleReagendarExameManterTipo(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_exame_convenio':
      return handleReagendarExameConvenio(userMessage, ctx, botSettings, clinicId)

    case 'reagendar_exame_sem_slots_convenio':
      return await handleReagendarExameSemSlotsConvenio(userMessage, ctx, botSettings, clinicId)

    case 'cancelar_qual':
      return handleQualAppointment(userMessage, ctx, 'cancelar', botSettings, clinicId)

    case 'cancelar_tipo':
      return handleCancelarTipo(userMessage, ctx, botSettings, clinicId)

    case 'cancelar_confirmar':
      return handleCancelarConfirmar(userMessage, ctx, clinicId, botSettings)

    case 'cancelar_encaixe':
      return handleCancelarEncaixe(conversationId, userMessage, ctx, clinicId, botSettings)

    case 'cancelar_exame_qual':
      return handleQualExame(userMessage, ctx, 'cancelar', botSettings, clinicId)

    case 'cancelar_exame_tipo':
      return handleCancelarExameTipo(userMessage, ctx, botSettings, clinicId)

    case 'audio_recebido': {
      const escapedAudio = userMessage.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
      // "2" or keywords → transfer to human
      if (escapedAudio === '2' || /secretaria|atendente|aguardar|humano/.test(escapedAudio)) {
        return {
          message: templates.attendantTransfer,
          nextState: 'atendente',
          nextContext: ctx,
          conversationStatus: 'waiting_human',
          transferToHuman: true,
        }
      }
      // "1" or menu keywords → go to menu
      return {
        message: buildMenuMessage(botSettings),
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
      }
    }

    case 'atendente':
      // Bot already handed off to human — acknowledge the message silently.
      // The webhook skips bot processing when status === 'waiting_human',
      // but if it reaches here (e.g. status was changed externally), stay put.
      return {
        message: 'Sua mensagem foi encaminhada à secretária. Aguarde o contato da nossa equipe. 😊',
        nextState: 'atendente',
        nextContext: ctx,
        // transferToHuman NOT set here — already transferred, no repeat
      }

    case 'ver_agendamentos':
      return handleVerAgendamentosResposta(userMessage, ctx, botSettings, clinicId)

    case 'ver_agendamento_selecionado':
      return handleVerAgendamentoSelecionado(userMessage, ctx, botSettings, clinicId)

    case 'confirmar_presenca':
      return await handleConfirmarPresenca(userMessage, ctx, clinicId)

    case 'lista_espera_faixa':
      return handleListaEsperaFaixa(conversationId, userMessage, ctx, botSettings, clinicId)

    case 'sem_horario':
      return handleSemHorario(userMessage, ctx, botSettings)

    default:
      return {
        message: botSettings?.message_fallback || buildMenuMessage(botSettings),
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
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: ctx,
    }
  }

  const intent = detectIntent(msg)

  switch (intent) {
    case 'schedule':
      return {
        message: templates.askScheduleForWhom,
        nextState: 'agendar_para_quem',
        nextContext: { ...ctx, intent: 'schedule', scheduleType: 'consulta' as const },
      }

    case 'schedule_exam': {
      if (botSettings?.bot_handles_exam === false) {
        return {
          message: templates.examToHuman,
          nextState: 'atendente',
          nextContext: { ...ctx, intent: 'schedule_exam' },
          conversationStatus: 'waiting_human',
          transferToHuman: true,
        }
      }
      return {
        message: templates.askExamForWhom,
        nextState: 'agendar_para_quem',
        nextContext: { ...ctx, intent: 'schedule', scheduleType: 'exame' as const },
      }
    }

    case 'reschedule': {
      // If clinic configured bot not to handle reschedule → transfer to human immediately
      if (botSettings?.bot_handles_reschedule === false) {
        return {
          message: templates.rescheduleToHuman,
          nextState: 'atendente',
          nextContext: { ...ctx, intent: 'reschedule' },
          conversationStatus: 'waiting_human',
          transferToHuman: true,
        }
      }

      // Fetch appointments and go straight to the list
      const appts = ctx.appointments && ctx.appointments.length > 0
        ? ctx.appointments
        : clinicId
          ? await getPatientAppointments(clinicId, ctx.patientPhone || '', ctx.patientCpf)
          : []

      if (appts.length === 0) {
        return {
          message: templates.rescheduleNoAppointments,
          nextState: 'menu',
          nextContext: baseIdentityContext(ctx),
        }
      }

      if (appts.length === 1) {
        // Only one — ask to confirm/change type before showing days
        const appt = appts[0]
        const newCtx = { ...ctx, intent: 'reschedule' as const, appointmentId: appt.id, appointments: appts, appointmentType: appt.appointmentType ?? ctx.appointmentType }
        if (appt.appointmentType) {
          return {
            message: templates.rescheduleConfirmType(appt.label, appt.appointmentType),
            nextState: 'reagendar_manter_tipo',
            nextContext: newCtx,
          }
        }
        return {
          message: templates.rescheduleConfirmTypeUnknown(appt.label),
          nextState: 'reagendar_manter_tipo',
          nextContext: { ...newCtx, appointmentType: undefined },
        }
      }

      // Multiple — ask which one
      return {
        message: templates.whichAppointmentReschedule(appts),
        nextState: 'reagendar_qual',
        nextContext: { ...ctx, intent: 'reschedule', appointments: appts },
      }
    }

    case 'cancel': {
      // If clinic configured bot not to handle cancellation → transfer to human immediately
      if (botSettings?.bot_handles_cancel === false) {
        return {
          message: templates.cancelToHuman,
          nextState: 'atendente',
          nextContext: { ...ctx, intent: 'cancel' },
          conversationStatus: 'waiting_human',
          transferToHuman: true,
        }
      }

      // Fetch appointments
      const appts = ctx.appointments && ctx.appointments.length > 0
        ? ctx.appointments
        : clinicId
          ? await getPatientAppointments(clinicId, ctx.patientPhone || '', ctx.patientCpf)
          : []

      if (appts.length === 0) {
        return {
          message: templates.cancelNoAppointmentsInfo,
          nextState: 'menu',
          nextContext: baseIdentityContext(ctx),
        }
      }

      if (appts.length === 1) {
        return {
          message: templates.cancelConfirmSingle(appts[0]),
          nextState: 'cancelar_confirmar',
          nextContext: { ...ctx, intent: 'cancel', appointmentId: appts[0].id, appointments: appts },
        }
      }

      return {
        message: templates.whichAppointmentCancel(appts),
        nextState: 'cancelar_qual',
        nextContext: { ...ctx, intent: 'cancel', appointments: appts },
      }
    }

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

    case 'view_appointments': {
      // Always resolve appointments here so ver_agendamentos only handles responses.

      // Pre-loaded and non-empty: show list directly
      if (ctx.appointments && ctx.appointments.length > 0) {
        return {
          message: templates.viewAppointments(ctx.appointments),
          nextState: 'ver_agendamentos',
          nextContext: { ...ctx, intent: 'view_appointments' },
        }
      }

      // Pre-loaded empty, or no pre-load at all: check GestãoDS first
      if (await shouldAskCpfForAppointmentLookup(ctx, clinicId)) {
        return askForAppointmentCpf(ctx, 'view_appointments')
      }

      // Sem GestãoDS: buscar por telefone agora
      if (clinicId) {
        const appointments = await getPatientAppointments(clinicId, ctx.patientPhone || '', ctx.patientCpf)
        if (appointments.length > 0) {
          return {
            message: templates.viewAppointments(appointments),
            nextState: 'ver_agendamentos',
            nextContext: { ...ctx, intent: 'view_appointments', appointments },
          }
        }
      }

      return {
        message: templates.viewAppointmentsNotFound,
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
      }
    }

    case 'confirm_attendance': {
      // Load appointments so handleConfirmarPresenca has an appointmentId
      const appts = ctx.appointments && ctx.appointments.length > 0
        ? ctx.appointments
        : clinicId
          ? await getPatientAppointments(clinicId, ctx.patientPhone || '', ctx.patientCpf)
          : []

      if (appts.length === 0) {
        return {
          message: templates.viewAppointmentsNotFound,
          nextState: 'menu',
          nextContext: baseIdentityContext(ctx),
        }
      }

      const appointmentId = appts.length === 1 ? appts[0].id : ctx.appointmentId
      return {
        message: templates.confirmAttendanceAsk,
        nextState: 'confirmar_presenca',
        nextContext: { ...ctx, intent: 'confirm_attendance', appointments: appts, appointmentId },
      }
    }

    case 'waitlist':
      return {
        message: templates.waitlistAskPreference,
        nextState: 'lista_espera_faixa',
        nextContext: { ...ctx, intent: 'waitlist', waitlistAppointmentType: ctx.appointmentType },
      }

    default:
      return {
        message: buildMenuMessage(botSettings),
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

function isValidFullName(value: string): boolean {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length < 5) return false

  const parts = cleaned
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)

  return parts.length >= 2 && parts.every((part) => part.length >= 2)
}

// ---- Tipo de atendimento (Particular / Convênio) ---------------------------

function parseAppointmentType(msg: string): 'particular' | 'convenio' | null {
  const n = msg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (
    n === '1' ||
    n.includes('particular') ||
    /(?:^|\D)1(?:\D|$)|option[_-]?1|button[_-]?1/.test(n)
  ) {
    return 'particular'
  }

  if (
    n === '2' ||
    n.includes('convenio') ||
    /(?:^|\D)2(?:\D|$)|option[_-]?2|button[_-]?2/.test(n)
  ) {
    return 'convenio'
  }

  return null
}

async function handleAgendarParaQuem(
  msg: string,
  ctx: BotContext,
): Promise<BotResponse> {
  const n = msg.trim().toLowerCase()

  const isExame = ctx.scheduleType === 'exame'
  const tipoState = isExame ? 'agendar_exame_tipo' : 'agendar_tipo'
  const tipoMsg = isExame ? templates.askExamType : templates.askScheduleType

  // Option 1 — for me / para mim
  if (/^1$|para mim|eu mesmo|pra mim/i.test(n)) {
    return {
      message: tipoMsg,
      nextState: tipoState,
      nextContext: { ...ctx, multiBookingTotal: 1, multiBookingCurrent: 1 },
    }
  }

  // Option 2 — for someone else / para outra pessoa
  if (/^2$|outra pessoa|outro|pra outra|para outra/i.test(n)) {
    return {
      message: tipoMsg,
      nextState: tipoState,
      nextContext: { ...ctx, multiBookingTotal: 1, multiBookingCurrent: 1 },
    }
  }

  // Option 3 — for more than one person / para mais de uma pessoa
  if (/^3$|mais de uma|mais de 1|v[aá]rias pessoas|m[uú]ltiplas/i.test(n)) {
    return {
      message: templates.askScheduleHowMany,
      nextState: 'agendar_quantos',
      nextContext: ctx,
    }
  }

  // Unknown input — repeat question
  return {
    message: templates.askScheduleForWhom,
    nextState: 'agendar_para_quem',
    nextContext: ctx,
  }
}

async function handleAgendarQuantos(
  msg: string,
  ctx: BotContext,
): Promise<BotResponse> {
  const n = msg.trim().toLowerCase()

  let total: number | null = null

  if (/^2$|duas pessoas|2 pessoas/i.test(n)) total = 2
  else if (/^3$|tr[eê]s pessoas|3 pessoas/i.test(n)) total = 3
  else if (/^4$|quatro pessoas|4 pessoas/i.test(n)) total = 4

  if (total) {
    const isExame = ctx.scheduleType === 'exame'
    return {
      message: isExame ? templates.askExamType : templates.askScheduleType,
      nextState: isExame ? 'agendar_exame_tipo' : 'agendar_tipo',
      nextContext: { ...ctx, multiBookingTotal: total, multiBookingCurrent: 1 },
    }
  }

  // Unknown input — repeat question
  return {
    message: templates.askScheduleHowMany,
    nextState: 'agendar_quantos',
    nextContext: ctx,
  }
}

async function handleAgendarTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const tipo = parseAppointmentType(msg)

  if (tipo === 'particular') {
    if (botSettings?.bot_handles_particular === true) {
      // Bot handles particular — continue scheduling flow
      return {
        message: templates.scheduleAskName,
        nextState: 'agendar_nome',
        nextContext: { ...ctx, appointmentType: 'particular' },
      }
    }
    return {
      message: templates.particularTransfer,
      nextState: 'atendente',
      nextContext: { ...ctx, appointmentType: 'particular' },
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (tipo === 'convenio') {
    const ctxWithType = { ...ctx, appointmentType: 'convenio' as const }
    const convenios = botSettings?.convenios ?? []
    if (convenios.length === 0) {
      return {
        message: templates.noConvenioConfigured,
        nextState: 'convenio_sem_cadastro',
        nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
      }
    }
    return {
      message: templates.askConvenio(convenios),
      nextState: 'agendar_convenio',
      nextContext: ctxWithType,
    }
  }

  // Unknown input — repeat the question
  return {
    message: templates.askScheduleType,
    nextState: 'agendar_tipo',
    nextContext: ctx,
  }
}

async function handleConvenioSemCadastro(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
): Promise<BotResponse> {
  const n = msg.trim().toLowerCase()
  // Option 1 or any secretary-related text → transfer to secretary
  if (n === '1' || /secret[aá]ria|atendente|humano|falar/i.test(n)) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }
  // Option 0 / menu / back
  return {
    message: buildMenuMessage(botSettings),
    nextState: 'menu',
    nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
  }
}

async function handleAgendarConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const convenios = botSettings?.convenios ?? []

  // Try to match by number or by name substring
  const normalized = msg.trim().toLowerCase()
  const byNumber = parseInt(normalized, 10)
  let selected: string | undefined

  if (!isNaN(byNumber) && byNumber >= 1 && byNumber <= convenios.length) {
    selected = convenios[byNumber - 1]
  } else {
    selected = convenios.find((c) => c.toLowerCase().includes(normalized))
  }

  if (!selected) {
    // Unknown input — repeat the list
    return {
      message: templates.askConvenio(convenios),
      nextState: 'agendar_convenio',
      nextContext: ctx,
    }
  }

  const ctxWithConvenio = { ...ctx, selectedConvenio: selected }

  // If this specific convenio requires an insurance card photo, ask for it and go to human review.
  const solicita = botSettings?.convenios_solicita_carteirinha ?? []
  if (solicita.includes(selected)) {
    return {
      message: templates.askCarteirinha(selected),
      nextState: 'convenio_aguardando_carteirinha',
      nextContext: ctxWithConvenio,
    }
  }

  if (!ctxWithConvenio.patientName) {
    return {
      message: templates.scheduleAskName,
      nextState: 'agendar_nome',
      nextContext: ctxWithConvenio,
    }
  }
  return showDayList({ clinicId, botSettings, ctx: ctxWithConvenio, flow: 'agendar', offset: 0 })
}

/**
 * State: convenio_aguardando_carteirinha
 * The patient was asked to send a photo of their insurance card.
 * Whatever they send (photo or text), we transfer to human.
 */
function handleConvenioAguardandoCarteirinha(ctx: BotContext): BotResponse {
  return {
    message: templates.carteirinhaRecebida,
    nextState: 'atendente',
    nextContext: ctx,
    conversationStatus: 'waiting_human',
    transferToHuman: true,
  }
}

// Convenio selection during reschedule
async function handleReagendarConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const convenios = (botSettings?.convenios ?? []).filter((s: string) => s.trim() !== '')
  const normalized = msg.trim().toLowerCase()
  const byNumber = parseInt(normalized, 10)
  let selected: string | undefined

  if (!isNaN(byNumber) && byNumber >= 1 && byNumber <= convenios.length) {
    selected = convenios[byNumber - 1]
  } else {
    selected = convenios.find((c: string) => c.toLowerCase().includes(normalized))
  }

  if (!selected) {
    return {
      message: templates.askConvenio(convenios),
      nextState: 'reagendar_convenio',
      nextContext: ctx,
    }
  }

  const ctxWithConvenio = { ...ctx, selectedConvenio: selected, appointmentType: 'convenio' as const }
  return showDayList({ clinicId, botSettings, ctx: ctxWithConvenio, flow: 'reagendar', offset: 0 })
}

// After user selected which appointment to reschedule, confirm or change its type
async function handleReagendarManterTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const normalized = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const currentType = ctx.appointmentType as 'particular' | 'convenio' | undefined

  let chosenType: 'particular' | 'convenio' | null = null

  if (currentType) {
    if (currentType === 'particular') {
      // Particular: 1 = confirm reschedule, 2 = back to menu
      if (normalized === '1' || normalized.includes('sim') || normalized.includes('remarcar') || normalized.includes('confirmar')) {
        chosenType = 'particular'
      } else if (normalized === '2' || normalized.includes('voltar') || normalized.includes('menu') || normalized.includes('nao') || normalized.includes('não')) {
        return {
          message: buildMenuMessage(botSettings),
          nextState: 'menu',
          nextContext: baseIdentityContext(ctx),
        }
      }
    } else {
      // Convenio: 1 = keep convenio, 2 = change to particular
      if (normalized === '1' || normalized.includes('manter') || normalized.includes('mesmo') || normalized === 'convenio') {
        chosenType = 'convenio'
      } else if (normalized === '2' || normalized.includes('mudar') || normalized.includes('trocar') || normalized.includes('particular')) {
        chosenType = 'particular'
      }
    }
  } else {
    // Unknown type: 1 = Particular, 2 = Convênio
    if (normalized === '1' || normalized.includes('particular')) {
      chosenType = 'particular'
    } else if (normalized === '2' || normalized.includes('convenio') || normalized.includes('plano')) {
      chosenType = 'convenio'
    }
  }

  if (!chosenType) {
    const apptLabel = ctx.appointments?.find(a => a.id === ctx.appointmentId)?.label ?? ''
    return withRetry({
      message: currentType
        ? templates.rescheduleConfirmType(apptLabel, currentType)
        : templates.rescheduleConfirmTypeUnknown(apptLabel),
      nextState: 'reagendar_manter_tipo',
      nextContext: ctx,
    }, ctx)
  }

  const newCtx = { ...ctx, appointmentType: chosenType }

  // If convênio and clinic has convênios configured, ask which
  if (chosenType === 'convenio') {
    const convenios = (botSettings?.convenios ?? []).filter((s: string) => s.trim() !== '')
    if (convenios.length > 0) {
      return {
        message: templates.askConvenio(convenios),
        nextState: 'reagendar_convenio',
        nextContext: newCtx,
      }
    }
  }

  return showDayList({ clinicId, botSettings, ctx: newCtx, flow: 'reagendar', offset: 0 })
}

async function handleReagendarTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const tipo = parseAppointmentType(msg)

  if (tipo === 'particular') {
    return {
      message: templates.particularTransfer,
      nextState: 'atendente',
      nextContext: { ...ctx, appointmentType: 'particular' },
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (tipo === 'convenio') {
    const ctxWithType = { ...ctx, appointmentType: 'convenio' as const }
    if (ctxWithType.appointments && ctxWithType.appointments.length === 0) {
      if (await shouldAskCpfForAppointmentLookup(ctxWithType, clinicId)) {
        return askForAppointmentCpf(ctxWithType, 'reschedule')
      }
      return { message: templates.cancelNoAppointments, nextState: 'menu', nextContext: { patientPhone: ctxWithType.patientPhone, patientName: ctxWithType.patientName } }
    }
    if (ctxWithType.appointments && ctxWithType.appointments.length > 0) {
      if (ctxWithType.appointments.length > 1) {
        return { message: templates.whichAppointmentReschedule(ctxWithType.appointments), nextState: 'reagendar_qual', nextContext: { ...ctxWithType, intent: 'reschedule' } }
      }
      return showDayList({ clinicId, botSettings, ctx: { ...ctxWithType, intent: 'reschedule', appointmentId: ctxWithType.appointments[0].id }, flow: 'reagendar', offset: 0 })
    }
    return {
      message: '🔍 Buscando suas consultas para remarcar...',
      nextState: 'ver_agendamentos',
      nextContext: { ...ctxWithType, intent: 'reschedule' },
    }
  }

  return {
    message: templates.askRescheduleType,
    nextState: 'reagendar_tipo',
    nextContext: ctx,
  }
}

async function handleCancelarTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const tipo = parseAppointmentType(msg)

  if (tipo === 'particular') {
    return {
      message: templates.particularTransfer,
      nextState: 'atendente',
      nextContext: { ...ctx, appointmentType: 'particular' },
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (tipo === 'convenio') {
    const ctxWithType = { ...ctx, appointmentType: 'convenio' as const }
    if (ctxWithType.appointments && ctxWithType.appointments.length === 0) {
      if (await shouldAskCpfForAppointmentLookup(ctxWithType, clinicId)) {
        return askForAppointmentCpf(ctxWithType, 'cancel')
      }
      return { message: templates.cancelNoAppointments, nextState: 'menu', nextContext: { patientPhone: ctxWithType.patientPhone, patientName: ctxWithType.patientName } }
    }
    if (ctxWithType.appointments && ctxWithType.appointments.length > 1) {
      return { message: templates.whichAppointmentCancel(ctxWithType.appointments), nextState: 'cancelar_qual', nextContext: { ...ctxWithType, intent: 'cancel' } }
    }
    if (ctxWithType.appointments && ctxWithType.appointments.length === 1) {
      return { message: templates.cancelConfirmSingle(ctxWithType.appointments[0]), nextState: 'cancelar_confirmar', nextContext: { ...ctxWithType, intent: 'cancel', appointmentId: ctxWithType.appointments[0].id } }
    }
    return { message: templates.cancelConfirmGeneric, nextState: 'cancelar_confirmar', nextContext: { ...ctxWithType, intent: 'cancel' } }
  }

  return {
    message: templates.askCancelType,
    nextState: 'cancelar_tipo',
    nextContext: ctx,
  }
}

// ---- Agendar ---------------------------------------------------------------

async function handleAgendarNome(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const name = msg.replace(/\s+/g, ' ').trim()

  if (!isValidFullName(name)) {
    return {
      message: `Preciso do *nome completo do paciente* para continuar.\n\nPor favor, me envie nome e sobrenome.\n\n0. Menu principal`,
      nextState: 'agendar_nome',
      nextContext: ctx,
    }
  }

  const nextContext = { ...ctx, patientName: name }

  if (ctx.pendingScheduleSlot) {
    return {
      message: buildScheduleConfirmationMessage({
        ctx: nextContext,
        slot: ctx.pendingScheduleSlot,
      }),
      nextState: 'agendar_confirmar',
      nextContext: {
        ...nextContext,
        pendingScheduleSlot: ctx.pendingScheduleSlot,
      },
    }
  }

  const dayListResponse = await showDayList({
    clinicId,
    botSettings,
    ctx: nextContext,
    flow: 'agendar',
    offset: 0,
  })

  return dayListResponse
}

async function handleAgendarCpf(
  _conversationId: string,
  _msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (ctx.pendingScheduleSlot) {
    return {
      message: buildScheduleConfirmationMessage({
        ctx,
        slot: ctx.pendingScheduleSlot,
      }),
      nextState: 'agendar_confirmar',
      nextContext: { ...ctx, pendingScheduleSlot: ctx.pendingScheduleSlot },
    }
  }

  return showDayList({
    clinicId,
    botSettings,
    ctx,
    flow: 'agendar',
    offset: 0,
  })
}

async function handleConsultarCpf(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId) return technicalError(ctx)

  const cpf = normalizeCpf(msg.trim())
  if (!cpf) {
    return {
      message: templates.invalidCpf,
      nextState: 'consultar_cpf',
      nextContext: ctx,
    }
  }

  const appointments = await getPatientAppointments(clinicId, ctx.patientPhone || '', cpf)
  const nextContext = {
    ...ctx,
    patientCpf: cpf,
    appointments,
    appointmentId: appointments.length === 1 ? appointments[0].id : undefined,
  }

  const response = await buildAppointmentLookupResponse({
    intent: ctx.intent,
    ctx: nextContext,
    appointments,
    clinicId,
    botSettings,
  })

  return {
    ...response,
    patientCpf: cpf,
  }
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
    patientCpf: ctx.patientCpf || undefined,
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
    return { message: withMenuHintText(result.message), nextState: 'agendar_dia', nextContext: ctx }
  }
  if (result.error === 'invalid_time' || result.error === 'too_soon') {
    return { message: withMenuHintText(result.message), nextState: 'agendar_hora', nextContext: { ...ctx, requestedTime } }
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
    return { message: templates.scheduleNoSlots, nextState: 'sem_horario', nextContext: { ...ctx, patientPhone: ctx.patientPhone, patientName: ctx.patientName } }
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
    return withRetry({
      message: templates.invalidChoice(slots.length),
      nextState: flow === 'agendar' ? 'agendar_slot_escolha' : 'reagendar_slot_escolha',
      nextContext: ctx,
    }, ctx)
  }

  const slot = slots[choice]

  if (flow === 'agendar') {
    return {
      message: buildScheduleConfirmationMessage({ ctx, slot }),
      nextState: 'agendar_confirmar',
      nextContext: { ...ctx, pendingScheduleSlot: slot },
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
    return withRetry({
      message: templates.invalidChoice(appointments.length),
      nextState: flow === 'cancelar' ? 'cancelar_qual' : 'reagendar_qual',
      nextContext: ctx,
    }, ctx)
  }

  const chosen = appointments[choice]
  const isExame = chosen.scheduleType === 'exame'

  if (flow === 'cancelar') {
    return {
      message: isExame ? templates.cancelExamConfirmSingle(chosen) : templates.cancelConfirmSingle(chosen),
      nextState: 'cancelar_confirmar',
      nextContext: { ...ctx, appointmentId: chosen.id, scheduleType: isExame ? 'exame' as const : 'consulta' as const },
    }
  }

  // reagendar — ask if they want to keep the same type or change
  const newCtx = { ...ctx, appointmentId: chosen.id, appointmentType: chosen.appointmentType ?? ctx.appointmentType, scheduleType: isExame ? 'exame' as const : 'consulta' as const, appointments }
  const tipo = chosen.appointmentType
  const manterTipoState = isExame ? 'reagendar_exame_manter_tipo' : 'reagendar_manter_tipo'

  if (tipo) {
    return {
      message: isExame ? templates.rescheduleExamConfirmType(chosen.label, tipo) : templates.rescheduleConfirmType(chosen.label, tipo),
      nextState: manterTipoState,
      nextContext: newCtx,
    }
  }

  // unknown type — ask
  return {
    message: isExame ? templates.rescheduleExamConfirmTypeUnknown(chosen.label) : templates.rescheduleConfirmTypeUnknown(chosen.label),
    nextState: manterTipoState,
    nextContext: { ...newCtx, appointmentType: undefined },
  }
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
    return { message: withMenuHintText('Não consegui entender a data. Pode repetir? (ex: segunda-feira, 28/04)'), nextState: 'reagendar_dia', nextContext: ctx }
  }
  if (!parsedTime) {
    return { message: withMenuHintText('Não consegui entender o horário. Pode repetir? (ex: 14h, 14:30)'), nextState: 'reagendar_hora', nextContext: { ...ctx, requestedTime } }
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
      return { message: templates.scheduleNoSlots, nextState: 'sem_horario', nextContext: { ...ctx, patientPhone: ctx.patientPhone, patientName: ctx.patientName } }
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

async function handleCancelarConfirmar(
  msg: string,
  ctx: BotContext,
  clinicId?: string,
  botSettings?: BotSettings | null,
): Promise<BotResponse> {
  const answer = detectYesNo(msg)

  if (answer === 'yes') {
    // Cancel immediately so the slot is freed even if the patient never replies
    // to the waitlist question (Bug fix: cancelamento deve ocorrer aqui).
    let canceledStartsAt: string | undefined
    if (ctx.appointmentId && clinicId) {
      const cancelResult = await cancelAppointment(clinicId, ctx.appointmentId, botSettings?.message_confirm_cancel)
      if (!cancelResult.success) {
        return {
          message: cancelResult.message,
          nextState: 'cancelar_confirmar',
          nextContext: ctx,
        }
      }
      canceledStartsAt = cancelResult.startsAt
      // Non-blocking: notify waitlist about the freed slot right away
      if (botSettings?.waitlist_notifications_enabled ?? true) {
        notifyWaitlistOnSlotFree(clinicId, canceledStartsAt).catch((err) =>
          console.error('[bot] waitlist notify after cancel failed:', err)
        )
      }
    }
    return {
      message: templates.cancelAskWaitlist,
      nextState: 'cancelar_encaixe',
      nextContext: { ...ctx, canceledStartsAt },
    }
  }

  if (answer === 'no') {
    return { message: templates.cancelAborted, nextState: 'menu', nextContext: {} }
  }

  return withRetry({ message: templates.cancelConfirmGeneric, nextState: 'cancelar_confirmar', nextContext: ctx }, ctx)
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

  // Appointment was already canceled in handleCancelarConfirmar.
  // Nothing to do here except handle the waitlist preference.

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
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  // -----------------------------------------------------------------------
  // First entry: ctx.appointments is not set yet — fetch now.
  // This covers the fallback case where the webhook pre-load didn't run.
  // -----------------------------------------------------------------------
  if (!ctx.appointments) {
    if (!clinicId) {
      return {
        message: templates.viewAppointmentsNotFound,
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
      }
    }

    // Fluxo 2 (GestãoDS): pede CPF se ainda não temos
    if (await shouldAskCpfForAppointmentLookup(ctx, clinicId)) {
      return askForAppointmentCpf(ctx, 'view_appointments')
    }

    // Fluxo 1 (sem GestãoDS ou CPF já conhecido): busca por telefone / CPF
    const appointments = await getPatientAppointments(clinicId, ctx.patientPhone || '', ctx.patientCpf)
    const nextCtx = { ...ctx, appointments }

    if (appointments.length === 0) {
      return {
        message: templates.viewAppointmentsNotFound,
        nextState: 'menu',
        nextContext: baseIdentityContext(nextCtx),
      }
    }

    return {
      message: templates.viewAppointments(appointments),
      nextState: 'ver_agendamentos',
      nextContext: { ...nextCtx, intent: 'view_appointments' },
    }
  }

  // -----------------------------------------------------------------------
  // Subsequent entries: appointments já estão no contexto.
  // O paciente está respondendo às opções: 1 Confirmar / 2 Remarcar / 3 Cancelar / 4 Menu
  // -----------------------------------------------------------------------

  // Empty appointments edge case
  if (ctx.appointments.length === 0) {
    return {
      message: templates.viewAppointmentsNotFound,
      nextState: 'menu',
      nextContext: baseIdentityContext(ctx),
    }
  }

  const num = parseInt(msg.trim(), 10)
  const msgNorm = msg.trim().toLowerCase()

  // Helper local — palavras-chave diretas, sem conflito com numeração do menu principal
  const wantsConfirm = num === 1 || msgNorm.includes('confirmar')
  const wantsReschedule = num === 2 || msgNorm.includes('remarcar') || msgNorm.includes('reagendar')
  const wantsCancel = num === 3 || msgNorm.includes('cancelar') || msgNorm.includes('desmarcar')
  const wantsMenu = num === 4 || msgNorm.includes('menu') || msgNorm.includes('voltar')

  // Paciente clicou num item da lista (WhatsApp envia o label do botão)
  const clickedIndex = ctx.appointments.findIndex(
    (a) => a.label.toLowerCase() === msgNorm || msgNorm.includes(a.label.toLowerCase().slice(0, 20)),
  )
  if (clickedIndex !== -1) {
    return {
      message: templates.viewAppointmentSelected(ctx.appointments[clickedIndex]),
      nextState: 'ver_agendamento_selecionado',
      nextContext: { ...ctx, selectedAppointmentIndex: clickedIndex },
    }
  }

  // Paciente tem apenas 1 consulta — opções globais agem diretamente
  if (ctx.appointments.length === 1) {
    const selected = ctx.appointments[0]

    // 1 — Confirmar presença
    if (wantsConfirm) {
      if (!clinicId) {
        return {
          message: 'Não consegui identificar a clínica para confirmar presença. Pode tentar novamente?',
          nextState: 'ver_agendamentos',
          nextContext: ctx,
        }
      }

      const confirmation = await confirmAppointmentAttendance(clinicId, selected.id)
      if (!confirmation.success) {
        return {
          message: confirmation.message,
          nextState: 'ver_agendamentos',
          nextContext: ctx,
        }
      }

      return {
        message: confirmation.message,
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
        conversationStatus: 'scheduled',
      }
    }

    // 2 — Remarcar
    if (wantsReschedule) {
      return {
        message: templates.whichAppointmentReschedule(ctx.appointments),
        nextState: 'reagendar_qual',
        nextContext: { ...ctx, intent: 'reschedule' },
      }
    }

    // 3 — Cancelar
    if (wantsCancel) {
      return {
        message: templates.cancelConfirmSingle(selected),
        nextState: 'cancelar_confirmar',
        nextContext: { ...ctx, intent: 'cancel', appointmentId: selected.id },
      }
    }

    // 4 — Menu
    if (wantsMenu) {
      return {
        message: buildMenuMessage(botSettings),
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
      }
    }
  }

  // Paciente tem 2+ consultas — confirmar exige selecionar item da lista
  if (ctx.appointments.length > 1) {
    if (wantsConfirm) {
      return {
        message: 'Para confirmar presença, selecione primeiro a consulta na lista acima.',
        nextState: 'ver_agendamentos',
        nextContext: ctx,
      }
    }
    if (wantsReschedule) {
      return {
        message: templates.whichAppointmentReschedule(ctx.appointments),
        nextState: 'reagendar_qual',
        nextContext: { ...ctx, intent: 'reschedule' },
      }
    }
    if (wantsCancel) {
      return {
        message: templates.whichAppointmentCancel(ctx.appointments),
        nextState: 'cancelar_qual',
        nextContext: { ...ctx, intent: 'cancel' },
      }
    }

    if (wantsMenu) {
      return {
        message: buildMenuMessage(botSettings),
        nextState: 'menu',
        nextContext: baseIdentityContext(ctx),
      }
    }
  }

  // Entrada não reconhecida — redisplay
  return {
    message: templates.viewAppointments(ctx.appointments),
    nextState: 'ver_agendamentos',
    nextContext: ctx,
  }
}

// ---- Agendamento selecionado ------------------------------------------------

async function handleVerAgendamentoSelecionado(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const appointments = ctx.appointments ?? []
  const idx = ctx.selectedAppointmentIndex ?? 0
  const selected = appointments[idx]

  if (!selected) {
    return {
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: baseIdentityContext(ctx),
    }
  }

  const numSel = parseInt(msg.trim(), 10)
  const msgNormSel = msg.trim().toLowerCase()

  // Detecção local — não usa detectIntent para evitar conflito com numeração do menu principal
  const selWantsConfirm = numSel === 1 || msgNormSel.includes('confirmar') || msgNormSel.includes('confirmo')
  const selWantsReschedule = numSel === 2 || msgNormSel.includes('remarcar') || msgNormSel.includes('reagendar')
  const selWantsCancel = numSel === 3 || msgNormSel.includes('cancelar') || msgNormSel.includes('desmarcar')
  const selWantsBack = numSel === 4 || msgNormSel.includes('voltar') || msgNormSel.includes('lista')

  // 1 — Confirmar presença
  if (selWantsConfirm) {
    if (!clinicId) {
      return {
        message: 'Não consegui identificar a clínica para confirmar presença. Pode tentar novamente?',
        nextState: 'ver_agendamento_selecionado',
        nextContext: ctx,
      }
    }

    const result = await confirmAppointmentAttendance(clinicId, selected.id)
    if (!result.success) {
      return {
        message: result.message,
        nextState: 'ver_agendamento_selecionado',
        nextContext: ctx,
      }
    }

    return {
      message: result.message,
      nextState: 'menu',
      nextContext: baseIdentityContext(ctx),
      conversationStatus: 'scheduled',
    }
  }

  // 2 — Remarcar
  if (selWantsReschedule) {
    const ctxWithTarget = { ...ctx, intent: 'reschedule' as const, appointmentId: selected.id, appointments: [selected] }
    return showDayList({ clinicId, botSettings, ctx: ctxWithTarget, flow: 'reagendar', offset: 0 })
  }

  // 3 — Cancelar
  if (selWantsCancel) {
    return {
      message: templates.cancelConfirmSingle(selected),
      nextState: 'cancelar_confirmar',
      nextContext: { ...ctx, intent: 'cancel', appointmentId: selected.id },
    }
  }

  // 4 — Voltar à lista
  if (selWantsBack) {
    return {
      message: templates.viewAppointments(appointments),
      nextState: 'ver_agendamentos',
      nextContext: { ...ctx, selectedAppointmentIndex: undefined },
    }
  }

  // Não reconhecido — repete a tela
  return {
    message: templates.viewAppointmentSelected(selected),
    nextState: 'ver_agendamento_selecionado',
    nextContext: ctx,
  }
}

// ---- Confirmar presença ----------------------------------------------------

async function handleConfirmarPresenca(msg: string, ctx: BotContext, clinicId?: string): Promise<BotResponse> {
  const answer = detectYesNo(msg)

  if (answer === 'yes') {
    const fallbackId = ctx.appointmentId || (ctx.appointments && ctx.appointments.length === 1 ? ctx.appointments[0].id : undefined)

    if (clinicId && fallbackId) {
      const confirmation = await confirmAppointmentAttendance(clinicId, fallbackId)
      if (!confirmation.success) {
        return {
          message: confirmation.message,
          nextState: 'confirmar_presenca',
          nextContext: ctx,
        }
      }

      return {
        message: confirmation.message,
        nextState: 'menu',
        nextContext: {},
        conversationStatus: 'scheduled',
      }
    }

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

// ---- Lista de espera por faixa de horário ----------------------------------

async function handleListaEsperaFaixa(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const normalized = msg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  type Preference = { start: string; end: string; label: string }
  let pref: Preference | null = null

  if (normalized === '1' || /(?:^|\D)1(?:\D|$)|manha|manha|manha/i.test(normalized)) {
    pref = { start: '08', end: '12', label: '🌅 Manhã (8h – 12h)' }
  } else if (normalized === '2' || /(?:^|\D)2(?:\D|$)|tarde/i.test(normalized)) {
    pref = { start: '12', end: '18', label: '🌞 Tarde (12h – 18h)' }
  } else if (normalized === '3' || /(?:^|\D)3(?:\D|$)|noite/i.test(normalized)) {
    pref = { start: '18', end: '21', label: '🌙 Noite (18h – 21h)' }
  } else if (normalized === '4' || /(?:^|\D)4(?:\D|$)|qualquer|any/i.test(normalized)) {
    pref = { start: '00', end: '23', label: '🕐 Qualquer horário' }
  }

  if (!pref) {
    return {
      message: templates.waitlistAskPreference,
      nextState: 'lista_espera_faixa',
      nextContext: ctx,
    }
  }

  if (clinicId) {
    await addToWaitlistWithPreference(clinicId, conversationId, {
      timeStart: pref.start,
      timeEnd: pref.end,
      appointmentType: ctx.waitlistAppointmentType,
    })
  }

  return {
    message: templates.waitlistConfirmed(pref.label),
    nextState: 'menu',
    nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    conversationStatus: 'waitlist',
  }
}

function handleSemHorario(msg: string, ctx: BotContext, botSettings?: BotSettings | null): BotResponse {
  const normalized = msg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  const wantsAttendant =
    normalized === '1' ||
    /(?:^|\D)1(?:\D|$)|option[_-]?1|button[_-]?1|sim|atendente|falar|humano|pessoa/i.test(normalized)

  const wantsWaitlist =
    normalized === '2' ||
    /(?:^|\D)2(?:\D|$)|option[_-]?2|button[_-]?2|lista|espera|aguardar/i.test(normalized)

  const wantsMenu =
    normalized === '3' ||
    /(?:^|\D)3(?:\D|$)|option[_-]?3|button[_-]?3|nao|voltar|menu|inicio/i.test(normalized)

  if (wantsAttendant) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (wantsWaitlist) {
    return {
      message: templates.waitlistAskPreference,
      nextState: 'lista_espera_faixa',
      nextContext: { ...ctx, waitlistAppointmentType: ctx.appointmentType },
    }
  }

  if (wantsMenu) {
    return {
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    }
  }

  // Unknown input — go to menu (never loop back to scheduleNoSlots)
  return {
    message: buildMenuMessage(botSettings),
    nextState: 'menu',
    nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
  }
}

// ---------------------------------------------------------------------------
// Helper: Build dynamic menu message
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS: Record<string, string> = {
  sun: 'Domingos',
  mon: 'Segundas-feiras',
  tue: 'Terças-feiras',
  wed: 'Quartas-feiras',
  thu: 'Quintas-feiras',
  fri: 'Sextas-feiras',
  sat: 'Sábados',
}

function formatParticularDaysLabel(keys: string[]): string {
  const labels = keys.map((k) => WEEKDAY_LABELS[k] ?? k)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return labels.slice(0, -1).join(', ') + ' e ' + labels[labels.length - 1]
}

export function buildMenuMessage(botSettings?: BotSettings | null): string {
  // Always build dynamically so menu_options + menu_order are respected.
  // message_menu (legacy free-text field) is intentionally NOT used here —
  // it would bypass enabled/disabled toggles and drag-drop ordering.

  // Get menu options (default: all enabled)
  const menuOptions = botSettings?.menu_options || {
    schedule: true,
    view_appointments: true,
    reschedule: true,
    cancel: true,
    attendant: true,
    schedule_exam: true,
    waitlist: false,
  }

  // Default order if menu_order is not set; also append any new keys missing from stored order
  const DEFAULT_ORDER = ['schedule', 'view_appointments', 'reschedule', 'cancel', 'attendant', 'schedule_exam', 'waitlist']
  const storedOrder: string[] = botSettings?.menu_order ?? DEFAULT_ORDER
  const missingKeys = DEFAULT_ORDER.filter((k) => !storedOrder.includes(k))
  const menuOrder: string[] = [...storedOrder, ...missingKeys]

  const OPTION_LABELS: Record<string, string> = {
    schedule: 'Agendar consulta',
    view_appointments: 'Ver meus agendamentos',
    reschedule: 'Remarcar consulta',
    cancel: 'Cancelar consulta',
    attendant: 'Falar com secretária',
    schedule_exam: '🩺 Agendar exame',
    waitlist: '📋 Lista de espera',
  }

  const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣']

  const preamble = 'Como posso te ajudar? 😊'
  const options: string[] = []

  for (const key of menuOrder) {
    if (menuOptions[key as keyof typeof menuOptions] && OPTION_LABELS[key]) {
      const emoji = NUMBER_EMOJIS[options.length] ?? `${options.length + 1}.`
      options.push(`${emoji} ${OPTION_LABELS[key]}`)
    }
  }

  return `${preamble}\n${options.join('\n')}`
}

function withMenuHintText(message: string): string {
  if (!message.trim()) return '0. 🏠 Menu principal'
  if (/voltar ao menu|menu principal|0\.\s*🏠/i.test(message)) return message
  return `${message}\n\n0. 🏠 Menu principal`
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

  const zapiSend = async (payload: Record<string, unknown>): Promise<string | false> => {
    const result = await sendInternalZapiMessage({
      clinicId,
      conversationId,
      phone,
      text: String(payload.text || ''),
      choices: Array.isArray(payload.choices) ? payload.choices as InteractiveChoice[] : undefined,
      choicesTitle: typeof payload.choicesTitle === 'string' ? payload.choicesTitle : undefined,
    })

    if (!result.success) {
      console.error('[Bot] Failed to send message via Z-API:', result.error || 'Unknown error')
      return false
    }

    return result.messageId || ''
  }

  try {
    // 1. Send via Z-API
    // Track primary message zapi_message_id so fromMe dedup works
    let primaryZapiMessageId: string | null = null

    if (interactive && interactive.choices.length >= 1) {
      // Optional preamble (e.g. welcome message) sent as plain text first
      if (response.preambleMessage?.trim()) {
        const preambleText = response.preambleMessage.trim()
        const msgId = await zapiSend({ conversationId, phone, text: preambleText, internalCall: true })
        if (msgId === false) return false
        // Save preamble to DB so fromMe webhook dedup skips it
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender: 'bot',
          content: preambleText,
          zapi_message_id: msgId || null,
          message_type: 'text',
          delivery_status: 'sent',
          direction: 'outbound',
          origin: 'bot',
          external_status: 'sent',
          reconciled_at: new Date().toISOString(),
          webhook_seen: false,
          sent_by_me_seen: false,
          metadata: { source: 'bot_engine_preamble' },
          created_at: new Date().toISOString(),
        })
        await new Promise(r => setTimeout(r, 400))
      }
      // Single interactive list bubble: cleanedMessage is the list context text
      const listText = interactive.message.trim() || 'Escolha uma opção:'
      const msgId = await zapiSend({
        conversationId,
        phone,
        text: listText,
        choices: interactive.choices,
        choicesTitle: interactive.title,
        internalCall: true,
      })
      if (msgId === false) return false
      primaryZapiMessageId = msgId || null
    } else {
      // No interactive choices — send as a single plain-text message
      const msgId = await zapiSend({ conversationId, phone, text: response.message, internalCall: true })
      if (msgId === false) return false
      primaryZapiMessageId = msgId || null
    }

    // 1b. Send follow-up message (e.g. menu after alert)
    if (response.followUpMessage?.trim()) {
      await new Promise(r => setTimeout(r, 500))
      const followUpText = response.followUpMessage.trim()
      const followUpInteractive = extractInteractiveChoices(followUpText)
      if (followUpInteractive && followUpInteractive.choices.length >= 1) {
        const msgId = await zapiSend({
          conversationId,
          phone,
          text: followUpInteractive.message.trim() || 'Escolha uma opção:',
          choices: followUpInteractive.choices,
          choicesTitle: followUpInteractive.title,
        })
        if (msgId === false) return false
        // Save follow-up to DB so fromMe webhook dedup skips it
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender: 'bot',
          content: followUpText,
          zapi_message_id: msgId || null,
          message_type: 'text',
          delivery_status: 'sent',
          direction: 'outbound',
          origin: 'bot',
          external_status: 'sent',
          reconciled_at: new Date().toISOString(),
          webhook_seen: false,
          sent_by_me_seen: false,
          metadata: { source: 'bot_engine_followup' },
          created_at: new Date().toISOString(),
        })
      } else {
        const msgId = await zapiSend({ conversationId, phone, text: followUpText })
        if (msgId === false) return false
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender: 'bot',
          content: followUpText,
          zapi_message_id: msgId || null,
          message_type: 'text',
          delivery_status: 'sent',
          direction: 'outbound',
          origin: 'bot',
          external_status: 'sent',
          reconciled_at: new Date().toISOString(),
          webhook_seen: false,
          sent_by_me_seen: false,
          metadata: { source: 'bot_engine_followup' },
          created_at: new Date().toISOString(),
        })
      }
    }

    // 2. Save bot message (with zapi_message_id so fromMe webhook dedup can skip it)
    const { error: msgError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'bot',
      content: response.message,
      zapi_message_id: primaryZapiMessageId,
      message_type: 'text',
      delivery_status: 'sent',
      direction: 'outbound',
      origin: 'bot',
      external_status: 'sent',
      reconciled_at: new Date().toISOString(),
      webhook_seen: false,
      sent_by_me_seen: false,
      metadata: {
        source: 'bot_engine',
      },
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
    if (response.patientCpf) update.cpf = response.patientCpf
    if (typeof response.nextContext?.patientName === 'string' && isValidFullName(response.nextContext.patientName)) {
      update.patient_name = response.nextContext.patientName.trim()
    }

    let { error: convError } = await supabase
      .from('conversations')
      .update(update)
      .eq('id', conversationId)

    if (convError && update.cpf && convError.code === 'PGRST204' && convError.message?.includes("'cpf' column")) {
      const retryUpdate = { ...update }
      delete retryUpdate.cpf

      const retryResult = await supabase
        .from('conversations')
        .update(retryUpdate)
        .eq('id', conversationId)

      convError = retryResult.error
    }

    // Retry without status if the DB check constraint rejects it (migration may not have run yet)
    if (convError && convError.code === '23514' && convError.message?.includes('status_check')) {
      console.warn('[Bot] status check constraint rejected value — retrying without status field. Run migration 031 in Supabase SQL Editor.')
      const retryUpdate = { ...update }
      delete retryUpdate.status

      const retryResult = await supabase
        .from('conversations')
        .update(retryUpdate)
        .eq('id', conversationId)

      convError = retryResult.error
    }

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

        await createNotification(
          clinicId,
          'conversation_waiting',
          'Bot solicitou atendimento humano',
          `A conversa com ${patientLabel} foi transferida para humano e está aguardando ação.`,
          {
            link: `/dashboard/conversas?id=${conversationId}`,
            conversationId,
          },
        )
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

  // When patient chose Convênio, exclude days reserved for Particular
  const excludeWeekdays =
    params.ctx.appointmentType === 'convenio'
      ? (params.botSettings.particular_days ?? [])
      : []

  // Fetch one extra day to detect if there are more pages
  const days = await getAvailableDays(
    params.clinicId,
    params.botSettings,
    new Date(),
    DAY_LIST_PAGE_SIZE + 1,
    params.offset,
    excludeWeekdays,
    params.ctx.appointmentType ?? null,
  )

  if (days.length === 0) {
    return { message: templates.scheduleNoSlots, nextState: 'sem_horario', nextContext: { ...params.ctx, ...params.ctx, patientPhone: params.ctx.patientPhone, patientName: params.ctx.patientName } }
  }

  const hasMore = days.length > DAY_LIST_PAGE_SIZE
  const page = days.slice(0, DAY_LIST_PAGE_SIZE)

  let message =
    params.flow === 'agendar'
      ? templates.scheduleDayList(page, hasMore)
      : templates.rescheduleDayList(page, hasMore)

  // Append particular days hint for convênio patients
  if (params.ctx.appointmentType === 'convenio') {
    const particularDays = params.botSettings.particular_days ?? []
    if (particularDays.length > 0) {
      const daysLabel = formatParticularDaysLabel(particularDays)
      message = message + templates.particularDaysHint(daysLabel)
    }
  }

  return {
    message,
    nextState: params.flow === 'agendar' ? 'agendar_dia_lista' : 'reagendar_dia_lista',
    nextContext: {
      ...params.ctx,
      availableDays: page,
      dayListHasMore: hasMore,
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

  // "Falar com atendente" option
  if (normalizedMsg.includes('atendente') || normalizedMsg.includes('falar') || normalizedMsg.includes('secretaria')) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  // "Ver mais datas" option
  if (normalizedMsg.includes('mais datas') || normalizedMsg.includes('ver mais')) {
    return showDayList({ clinicId, botSettings, ctx, flow: 'agendar', offset: (ctx.dayListOffset ?? 0) + DAY_LIST_PAGE_SIZE })
  }

  const choice = resolveChoiceIndex(msg, days.map(d => d.label))

  if (choice < 0 || choice >= days.length) {
    return withRetry({
      message: templates.invalidChoice(days.length),
      nextState: 'agendar_dia_lista',
      nextContext: ctx,
    }, ctx)
  }

  const selectedDay = days[choice]
  const slots = await getSlotsForDay(clinicId, selectedDay.date, botSettings, 9, ctx.appointmentType ?? null)

  if (slots.length === 0) {
    // If searching in convênio and no slots, offer particular
    if (ctx.appointmentType === 'convenio') {
      return {
        message: templates.scheduleNoSlotsConvenioSuggestParticular,
        nextState: 'agendar_sem_slots_convenio',
        nextContext: { ...ctx, patientPhone: ctx.patientPhone, patientName: ctx.patientName, selectedDay: selectedDay.date, selectedDayLabel: selectedDay.label },
      }
    }
    return { message: templates.scheduleNoSlots, nextState: 'sem_horario', nextContext: { ...ctx, patientPhone: ctx.patientPhone, patientName: ctx.patientName } }
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
    return withRetry({
      message: templates.invalidChoice(slots.length),
      nextState: 'agendar_hora_lista',
      nextContext: ctx,
    }, ctx)
  }

  const slot = slots[choice]

  return {
    message: buildScheduleConfirmationMessage({ ctx, slot }),
    nextState: 'agendar_confirmar',
    nextContext: { ...ctx, pendingScheduleSlot: slot },
  }
}

async function handleAgendarConfirmar(
  conversationId: string,
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId) return technicalError(ctx)

  const slot = ctx.pendingScheduleSlot
  if (!slot) {
    return showDayList({
      clinicId,
      botSettings,
      ctx,
      flow: 'agendar',
      offset: 0,
    })
  }

  const normalizedMsg = normalizeChoiceText(msg)
  if (
    normalizedMsg.includes('alterar') ||
    normalizedMsg.includes('mudar') ||
    normalizedMsg.includes('trocar')
  ) {
    return {
      message: templates.scheduleChangeField,
      nextState: 'agendar_alterar_campo',
      nextContext: ctx,
    }
  }

  const answer = detectYesNo(msg)

  if (answer === 'unknown') {
    return {
      message: buildScheduleConfirmationMessage({ ctx, slot }),
      nextState: 'agendar_confirmar',
      nextContext: ctx,
    }
  }

  if (answer === 'no') {
    return {
      message: templates.scheduleChangeField,
      nextState: 'agendar_alterar_campo',
      nextContext: ctx,
    }
  }

  const result = await createAppointmentFromSlot({
    clinicId,
    conversationId,
    patientName: ctx.patientName || 'Paciente',
    patientPhone: ctx.patientPhone || '',
    patientCpf: ctx.patientCpf || undefined,
    slot,
    confirmTemplate: botSettings?.message_confirm_schedule,
    appointmentType: ctx.appointmentType || 'particular',
    selectedConvenio: ctx.selectedConvenio || null,
    scheduleType: ctx.scheduleType || 'consulta',
  })

  if (!result.success) {
    return {
      message: result.message,
      nextState: 'agendar_confirmar',
      nextContext: ctx,
    }
  }

  // Multi-booking: check if there are more people to book for
  const current = ctx.multiBookingCurrent ?? 1
  const total = ctx.multiBookingTotal ?? 1

  // Accumulate this booking into the list
  const completedBookings = [
    ...(ctx.completedBookings ?? []),
    { name: ctx.patientName || 'Paciente', label: slot.label },
  ]

  if (current < total) {
    const next = current + 1
    const ordinal = next === 2 ? '2ª' : next === 3 ? '3ª' : `${next}ª`
    return {
      message: `✅ *Agendamento ${current} de ${total} confirmado!*\n\nAgora vou agendar para a *${ordinal} pessoa*.\n\nQual o nome completo?`,
      nextState: 'agendar_nome',
      nextContext: {
        patientPhone: ctx.patientPhone,
        appointmentType: ctx.appointmentType,
        selectedConvenio: ctx.selectedConvenio,
        multiBookingTotal: total,
        multiBookingCurrent: next,
        completedBookings,
        intent: ctx.intent,
      },
    }
  }

  // Last (or only) booking — if multi-booking, show a summary of all
  if (total > 1) {
    const lines = completedBookings
      .map((b, i) => `${i + 1}️⃣ *${b.name}* — 📅 ${b.label}`)
      .join('\n')
    const convenioLine = ctx.selectedConvenio ? `\n🏥 Convênio: ${ctx.selectedConvenio}` : ''
    const summaryMsg = `✅ *Todos os agendamentos confirmados!*${convenioLine}\n\n${lines}\n\nVocê receberá lembretes antes de cada consulta. Para cancelar ou remarcar, é só me avisar. 😊\n\n0. Menu principal`
    return {
      message: summaryMsg,
      nextState: 'menu',
      nextContext: {},
      conversationStatus: 'scheduled',
    }
  }

  return {
    message: result.message,
    nextState: 'menu',
    nextContext: {},
    conversationStatus: 'scheduled',
  }
}

async function handleAgendarAlterarCampo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const field = detectScheduleEditField(msg)

  if (field === 'unknown') {
    return {
      message: templates.scheduleChangeField,
      nextState: 'agendar_alterar_campo',
      nextContext: ctx,
    }
  }

  if (field === 'patient') {
    return {
      message: templates.scheduleAskPatientName,
      nextState: 'agendar_alterar_paciente',
      nextContext: ctx,
    }
  }

  if (!clinicId || !botSettings) return technicalError(ctx)

  if (field === 'day') {
    return showDayList({
      clinicId,
      botSettings,
      ctx: {
        ...ctx,
        pendingScheduleSlot: undefined,
        availableSlots: undefined,
        selectedDay: undefined,
        selectedDayLabel: undefined,
      },
      flow: 'agendar',
      offset: 0,
    })
  }

  const scheduleDay = deriveScheduleDayContext(ctx)
  if (!scheduleDay.selectedDay || !scheduleDay.selectedDayLabel) {
    return showDayList({
      clinicId,
      botSettings,
      ctx: {
        ...ctx,
        pendingScheduleSlot: undefined,
        availableSlots: undefined,
      },
      flow: 'agendar',
      offset: 0,
    })
  }

  const slots = await getSlotsForDay(clinicId, scheduleDay.selectedDay, botSettings, 9, ctx.appointmentType ?? null)

  if (slots.length === 0) {
    return {
      message: templates.scheduleNoSlots,
      nextState: 'sem_horario',
      nextContext: {
        ...ctx,
        patientPhone: ctx.patientPhone,
        patientName: ctx.patientName,
      },
    }
  }

  return {
    message: templates.scheduleSlotList(scheduleDay.selectedDayLabel, slots, true),
    nextState: 'agendar_hora_lista',
    nextContext: {
      ...ctx,
      selectedDay: scheduleDay.selectedDay,
      selectedDayLabel: scheduleDay.selectedDayLabel,
      availableSlots: slots,
      pendingScheduleSlot: undefined,
    },
  }
}

async function handleAgendarAlterarPaciente(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const patientName = msg.replace(/\s+/g, ' ').trim()

  if (!isValidFullName(patientName)) {
    return {
      message: `Preciso do *nome completo do paciente* para continuar.\n\nPor favor, me envie nome e sobrenome.\n\n0. Menu principal`,
      nextState: 'agendar_alterar_paciente',
      nextContext: ctx,
    }
  }

  if (ctx.pendingScheduleSlot) {
    return {
      message: buildScheduleConfirmationMessage({
        ctx: { ...ctx, patientName },
        slot: ctx.pendingScheduleSlot,
      }),
      nextState: 'agendar_confirmar',
      nextContext: {
        ...ctx,
        patientName,
        pendingScheduleSlot: ctx.pendingScheduleSlot,
      },
    }
  }

  if (!clinicId || !botSettings) {
    return {
      message: templates.scheduleAskPatientName,
      nextState: 'agendar_alterar_paciente',
      nextContext: {
        ...ctx,
        patientName,
      },
    }
  }

  return {
    ...(await showDayList({
      clinicId,
      botSettings,
      ctx: {
        ...ctx,
        patientName,
      },
      flow: 'agendar',
      offset: 0,
    })),
  }
}

async function handleAgendarSemSlotsConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const normalizedMsg = msg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  // "1. Ver horários particulares"
  if (normalizedMsg === '1' || /(?:^|\D)1(?:\D|$)|particular|ver particular|horario particular/.test(normalizedMsg)) {
    const selectedDay = ctx.selectedDay
    return await showDayList({
      clinicId,
      botSettings,
      ctx: { ...ctx, appointmentType: 'particular' },
      flow: 'agendar',
      offset: 0,
    })
  }

  // "2. Falar com secretária"
  if (normalizedMsg === '2' || /(?:^|\D)2(?:\D|$)|secretaria|falar|atendente/.test(normalizedMsg)) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  // "3. Voltar ao menu" (handleAgendarSemSlotsConvenio)
  if (normalizedMsg === '3' || /(?:^|\D)3(?:\D|$)|menu|voltar/.test(normalizedMsg)) {
    return {
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    }
  }

  // Invalid choice
  return withRetry({
    message: templates.invalidChoice(3),
    nextState: 'agendar_sem_slots_convenio',
    nextContext: ctx,
  }, ctx)
}

// ---------------------------------------------------------------------------
// Exam scheduling handlers
// ---------------------------------------------------------------------------

async function handleAgendarExameTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const tipo = parseAppointmentType(msg)

  if (tipo === 'particular') {
    if (botSettings?.bot_handles_exam_particular === true) {
      return {
        message: templates.scheduleExamAskName,
        nextState: 'agendar_nome',
        nextContext: { ...ctx, appointmentType: 'particular', scheduleType: 'exame' as const },
      }
    }
    return {
      message: templates.examParticularTransfer,
      nextState: 'atendente',
      nextContext: { ...ctx, appointmentType: 'particular', scheduleType: 'exame' as const },
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (tipo === 'convenio') {
    const ctxWithType = { ...ctx, appointmentType: 'convenio' as const, scheduleType: 'exame' as const }
    const convenios = botSettings?.convenios ?? []
    if (convenios.length === 0) {
      return {
        message: templates.noConvenioConfigured,
        nextState: 'convenio_sem_cadastro',
        nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName, scheduleType: 'exame' as const },
      }
    }
    return {
      message: templates.askConvenio(convenios),
      nextState: 'agendar_exame_convenio',
      nextContext: ctxWithType,
    }
  }

  return {
    message: templates.askExamType,
    nextState: 'agendar_exame_tipo',
    nextContext: ctx,
  }
}

async function handleAgendarExameConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const convenios = botSettings?.convenios ?? []
  const normalized = msg.trim().toLowerCase()
  const byNumber = parseInt(normalized, 10)
  let selected: string | undefined

  if (!isNaN(byNumber) && byNumber >= 1 && byNumber <= convenios.length) {
    selected = convenios[byNumber - 1]
  } else {
    selected = convenios.find((c) => c.toLowerCase().includes(normalized))
  }

  if (!selected) {
    return {
      message: templates.askConvenio(convenios),
      nextState: 'agendar_exame_convenio',
      nextContext: ctx,
    }
  }

  const ctxWithConvenio = { ...ctx, selectedConvenio: selected, scheduleType: 'exame' as const }

  const solicita = botSettings?.convenios_solicita_carteirinha ?? []
  if (solicita.includes(selected)) {
    return {
      message: templates.askCarteirinha(selected),
      nextState: 'convenio_aguardando_carteirinha',
      nextContext: ctxWithConvenio,
    }
  }

  if (!ctxWithConvenio.patientName) {
    return {
      message: templates.scheduleExamAskName,
      nextState: 'agendar_nome',
      nextContext: ctxWithConvenio,
    }
  }
  return showDayList({ clinicId, botSettings, ctx: ctxWithConvenio, flow: 'agendar', offset: 0 })
}

async function handleAgendarExameSemSlotsConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const normalizedMsg = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

  if (normalizedMsg === '1' || /(?:^|\D)1(?:\D|$)|particular|ver particular|horario particular/.test(normalizedMsg)) {
    return await showDayList({
      clinicId,
      botSettings,
      ctx: { ...ctx, appointmentType: 'particular', scheduleType: 'exame' as const },
      flow: 'agendar',
      offset: 0,
    })
  }

  if (normalizedMsg === '2' || /(?:^|\D)2(?:\D|$)|secretaria|falar|atendente/.test(normalizedMsg)) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (normalizedMsg === '3' || /(?:^|\D)3(?:\D|$)|menu|voltar/.test(normalizedMsg)) {
    return {
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    }
  }

  return withRetry({
    message: templates.invalidChoice(3),
    nextState: 'agendar_exame_sem_slots_convenio',
    nextContext: ctx,
  }, ctx)
}

async function handleQualExame(
  msg: string,
  ctx: BotContext,
  flow: 'cancelar' | 'reagendar',
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const appointments = (ctx.appointments ?? []).filter(a => a.scheduleType === 'exame' || a.scheduleType == null)
  const choice = resolveChoiceIndex(msg, appointments.map(a => a.label))

  if (choice < 0 || choice >= appointments.length) {
    return withRetry({
      message: templates.invalidChoice(appointments.length),
      nextState: flow === 'cancelar' ? 'cancelar_exame_qual' : 'reagendar_exame_qual',
      nextContext: ctx,
    }, ctx)
  }

  const chosen = appointments[choice]

  if (flow === 'cancelar') {
    return {
      message: templates.cancelExamConfirmSingle(chosen),
      nextState: 'cancelar_confirmar',
      nextContext: { ...ctx, appointmentId: chosen.id, scheduleType: 'exame' as const },
    }
  }

  const newCtx = { ...ctx, appointmentId: chosen.id, appointmentType: chosen.appointmentType ?? ctx.appointmentType, scheduleType: 'exame' as const, appointments }
  const tipo = chosen.appointmentType

  if (tipo) {
    return {
      message: templates.rescheduleExamConfirmType(chosen.label, tipo),
      nextState: 'reagendar_exame_manter_tipo',
      nextContext: newCtx,
    }
  }

  return {
    message: templates.rescheduleExamConfirmTypeUnknown(chosen.label),
    nextState: 'reagendar_exame_manter_tipo',
    nextContext: { ...newCtx, appointmentType: undefined },
  }
}

async function handleReagendarExameManterTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const normalized = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const currentType = ctx.appointmentType as 'particular' | 'convenio' | undefined
  let chosenType: 'particular' | 'convenio' | null = null

  if (currentType) {
    if (currentType === 'particular') {
      if (normalized === '1' || normalized.includes('sim') || normalized.includes('remarcar') || normalized.includes('confirmar')) {
        chosenType = 'particular'
      } else if (normalized === '2' || normalized.includes('voltar') || normalized.includes('menu') || normalized.includes('nao') || normalized.includes('não')) {
        return {
          message: buildMenuMessage(botSettings),
          nextState: 'menu',
          nextContext: baseIdentityContext(ctx),
        }
      }
    } else {
      if (normalized === '1' || normalized.includes('manter') || normalized.includes('mesmo') || normalized === 'convenio') {
        chosenType = 'convenio'
      } else if (normalized === '2' || normalized.includes('mudar') || normalized.includes('trocar') || normalized.includes('particular')) {
        chosenType = 'particular'
      }
    }
  } else {
    if (normalized === '1' || normalized.includes('particular')) {
      chosenType = 'particular'
    } else if (normalized === '2' || normalized.includes('convenio') || normalized.includes('plano')) {
      chosenType = 'convenio'
    }
  }

  if (!chosenType) {
    const apptLabel = ctx.appointments?.find(a => a.id === ctx.appointmentId)?.label ?? ''
    return withRetry({
      message: currentType
        ? templates.rescheduleExamConfirmType(apptLabel, currentType)
        : templates.rescheduleExamConfirmTypeUnknown(apptLabel),
      nextState: 'reagendar_exame_manter_tipo',
      nextContext: ctx,
    }, ctx)
  }

  const newCtx = { ...ctx, appointmentType: chosenType, scheduleType: 'exame' as const }

  if (chosenType === 'convenio') {
    const convenios = (botSettings?.convenios ?? []).filter((s: string) => s.trim() !== '')
    if (convenios.length > 0) {
      return {
        message: templates.askConvenio(convenios),
        nextState: 'reagendar_exame_convenio',
        nextContext: newCtx,
      }
    }
  }

  return showDayList({ clinicId, botSettings, ctx: newCtx, flow: 'reagendar', offset: 0 })
}

async function handleReagendarExameConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const convenios = (botSettings?.convenios ?? []).filter((s: string) => s.trim() !== '')
  const normalized = msg.trim().toLowerCase()
  const byNumber = parseInt(normalized, 10)
  let selected: string | undefined

  if (!isNaN(byNumber) && byNumber >= 1 && byNumber <= convenios.length) {
    selected = convenios[byNumber - 1]
  } else {
    selected = convenios.find((c: string) => c.toLowerCase().includes(normalized))
  }

  if (!selected) {
    return {
      message: templates.askConvenio(convenios),
      nextState: 'reagendar_exame_convenio',
      nextContext: ctx,
    }
  }

  const ctxWithConvenio = { ...ctx, selectedConvenio: selected, appointmentType: 'convenio' as const, scheduleType: 'exame' as const }
  return showDayList({ clinicId, botSettings, ctx: ctxWithConvenio, flow: 'reagendar', offset: 0 })
}

async function handleReagendarExameSemSlotsConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const normalizedMsg = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

  if (normalizedMsg === '1' || /(?:^|\D)1(?:\D|$)|particular|ver particular|horario particular/.test(normalizedMsg)) {
    return await showDayList({
      clinicId,
      botSettings,
      ctx: { ...ctx, appointmentType: 'particular', scheduleType: 'exame' as const },
      flow: 'reagendar',
      offset: 0,
    })
  }

  if (normalizedMsg === '2' || /(?:^|\D)2(?:\D|$)|secretaria|falar|atendente/.test(normalizedMsg)) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (normalizedMsg === '3' || /(?:^|\D)3(?:\D|$)|menu|voltar/.test(normalizedMsg)) {
    return {
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    }
  }

  return withRetry({
    message: templates.invalidChoice(3),
    nextState: 'reagendar_exame_sem_slots_convenio',
    nextContext: ctx,
  }, ctx)
}

async function handleCancelarExameTipo(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  const tipo = parseAppointmentType(msg)

  if (tipo === 'particular') {
    const ctxWithType = { ...ctx, appointmentType: 'particular' as const, scheduleType: 'exame' as const }
    if (ctxWithType.appointments && ctxWithType.appointments.length > 1) {
      const exames = ctxWithType.appointments.filter(a => a.scheduleType === 'exame' || a.scheduleType == null)
      return { message: templates.whichExamCancel(exames), nextState: 'cancelar_exame_qual', nextContext: { ...ctxWithType, appointments: exames } }
    }
    if (ctxWithType.appointments && ctxWithType.appointments.length === 1) {
      return { message: templates.cancelExamConfirmSingle(ctxWithType.appointments[0]), nextState: 'cancelar_confirmar', nextContext: { ...ctxWithType, appointmentId: ctxWithType.appointments[0].id } }
    }
    return { message: templates.cancelExamWithoutWaitlist, nextState: 'menu', nextContext: baseIdentityContext(ctx) }
  }

  if (tipo === 'convenio') {
    const ctxWithType = { ...ctx, appointmentType: 'convenio' as const, scheduleType: 'exame' as const }
    const exames = (ctxWithType.appointments ?? []).filter(a => a.scheduleType === 'exame' || a.scheduleType == null)
    if (exames.length > 1) {
      return { message: templates.whichExamCancel(exames), nextState: 'cancelar_exame_qual', nextContext: { ...ctxWithType, appointments: exames } }
    }
    if (exames.length === 1) {
      return { message: templates.cancelExamConfirmSingle(exames[0]), nextState: 'cancelar_confirmar', nextContext: { ...ctxWithType, appointmentId: exames[0].id } }
    }
    return { message: templates.cancelExamWithoutWaitlist, nextState: 'menu', nextContext: baseIdentityContext(ctx) }
  }

  return {
    message: templates.cancelExamAskType,
    nextState: 'cancelar_exame_tipo',
    nextContext: ctx,
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

  // "Falar com atendente" option
  if (normalizedMsg.includes('atendente') || normalizedMsg.includes('falar') || normalizedMsg.includes('secretaria')) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  if (normalizedMsg.includes('mais datas') || normalizedMsg.includes('ver mais')) {
    return showDayList({ clinicId, botSettings, ctx, flow: 'reagendar', offset: (ctx.dayListOffset ?? 0) + DAY_LIST_PAGE_SIZE })
  }

  const choice = resolveChoiceIndex(msg, days.map(d => d.label))

  if (choice < 0 || choice >= days.length) {
    return withRetry({
      message: templates.invalidChoice(days.length),
      nextState: 'reagendar_dia_lista',
      nextContext: ctx,
    }, ctx)
  }

  const selectedDay = days[choice]
  const slots = await getSlotsForDay(clinicId, selectedDay.date, botSettings, 9, ctx.appointmentType ?? null)

  if (slots.length === 0) {
    // If searching in convênio and no slots, offer particular
    if (ctx.appointmentType === 'convenio') {
      return {
        message: templates.scheduleNoSlotsConvenioSuggestParticular,
        nextState: 'reagendar_sem_slots_convenio',
        nextContext: { ...ctx, patientPhone: ctx.patientPhone, patientName: ctx.patientName, selectedDay: selectedDay.date, selectedDayLabel: selectedDay.label },
      }
    }
    return { message: templates.scheduleNoSlots, nextState: 'sem_horario', nextContext: { ...ctx, patientPhone: ctx.patientPhone, patientName: ctx.patientName } }
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
    return withRetry({
      message: templates.invalidChoice(slots.length),
      nextState: 'reagendar_hora_lista',
      nextContext: ctx,
    }, ctx)
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

async function handleReagendarSemSlotsConvenio(
  msg: string,
  ctx: BotContext,
  botSettings?: BotSettings | null,
  clinicId?: string,
): Promise<BotResponse> {
  if (!clinicId || !botSettings) return technicalError(ctx)

  const normalizedMsg = msg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  // "1. Ver horários particulares"
  if (normalizedMsg === '1' || /(?:^|\D)1(?:\D|$)|particular|ver particular|horario particular/.test(normalizedMsg)) {
    const selectedDay = ctx.selectedDay
    return await showDayList({
      clinicId,
      botSettings,
      ctx: { ...ctx, appointmentType: 'particular' },
      flow: 'reagendar',
      offset: 0,
    })
  }

  // "2. Falar com secretária"
  if (normalizedMsg === '2' || /(?:^|\D)2(?:\D|$)|secretaria|falar|atendente/.test(normalizedMsg)) {
    return {
      message: templates.attendantTransfer,
      nextState: 'atendente',
      nextContext: ctx,
      conversationStatus: 'waiting_human',
      transferToHuman: true,
    }
  }

  // "3. Voltar ao menu" (handleReagendarSemSlotsConvenio)
  if (normalizedMsg === '3' || /(?:^|\D)3(?:\D|$)|menu|voltar/.test(normalizedMsg)) {
    return {
      message: buildMenuMessage(botSettings),
      nextState: 'menu',
      nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    }
  }

  // Invalid choice
  return withRetry({
    message: templates.invalidChoice(3),
    nextState: 'reagendar_sem_slots_convenio',
    nextContext: ctx,
  }, ctx)
}

function technicalError(ctx: BotContext): BotResponse {
  return {
    message: templates.technicalError,
    nextState: 'menu',
    nextContext: ctx,
  }
}

/**
 * Wraps a "stay in same state" response with retry counting.
 * After MAX_RETRIES consecutive invalid inputs, the bot offers to connect
 * the patient with a human attendant instead of looping forever.
 */
const MAX_RETRIES = 3

function withRetry(
  response: BotResponse,
  ctx: BotContext,
): BotResponse {
  const retries = (ctx.retryCount ?? 0) + 1
  if (retries >= MAX_RETRIES) {
    return {
      message: `Estou tendo dificuldade em entender. O que deseja fazer?\n\n1️⃣ Falar com secretária\n2️⃣ Voltar ao menu`,
      nextState: 'menu',
      nextContext: { patientPhone: ctx.patientPhone, patientName: ctx.patientName },
    }
  }
  return { ...response, nextContext: { ...response.nextContext, retryCount: retries } }
}

function resolveChoiceIndex(message: string, options: string[]): number {
  const normalizedOptions = options.map(option => normalizeChoiceText(option))
  const candidates = extractChoiceCandidates(message)

  for (const candidate of candidates) {
    const exactIndex = normalizedOptions.findIndex(option => option === candidate)
    if (exactIndex >= 0) return exactIndex
  }

  // Fallback for noisy payloads (e.g. multiline replies containing prompt + selected value).
  for (const candidate of candidates) {
    const containsMatches: number[] = []

    normalizedOptions.forEach((option, index) => {
      if (!option) return
      if (candidate.includes(option) || option.includes(candidate)) {
        containsMatches.push(index)
      }
    })

    if (containsMatches.length === 1) {
      return containsMatches[0]
    }
  }

  for (const candidate of candidates) {
    const numericMatch = candidate.match(/^(?:option|button)[_-]?(\d+)$|^(\d+)$/)
    const numericValue = numericMatch?.[1] || numericMatch?.[2]
    const numericChoice = numericValue ? parseInt(numericValue, 10) : NaN
    if (!Number.isNaN(numericChoice) && numericChoice >= 1 && numericChoice <= options.length) {
      return numericChoice - 1
    }
  }

  return -1
}

function normalizeChoiceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`"']/g, '')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

function extractChoiceCandidates(message: string): string[] {
  const raw = String(message || '')
  const lines = raw
    .split(/\r?\n/)
    .map(line => normalizeChoiceText(line))
    .filter(Boolean)

  const normalizedFull = normalizeChoiceText(raw)
  const candidates = [normalizedFull, ...lines]

  if (lines.length > 0) {
    candidates.push(lines[lines.length - 1])
  }

  return [...new Set(candidates)]
}

function matchesChoiceSelection(message: string, choiceNumber: number): boolean {
  if (choiceNumber <= 0) return false

  const normalized = normalizeChoiceText(message)
  if (!normalized) return false

  if (normalized === String(choiceNumber)) return true

  return new RegExp(`^(?:option|button)[_-]?${choiceNumber}$`).test(normalized)
}

function getMenuChoiceIndex(state: BotState, ctx: BotContext): number | null {
  switch (state) {
    case 'ver_agendamentos':
      return 4

    case 'ver_agendamento_selecionado':
      return 4

    case 'sem_horario':
    case 'agendar_confirmar':
    case 'agendar_alterar_campo':
    case 'cancelar_confirmar':
    case 'cancelar_encaixe':
    case 'confirmar_presenca':
    case 'lista_espera_faixa':
      return state === 'sem_horario' ? 3 : state === 'lista_espera_faixa' ? 4 : 3

    case 'agendar_slot_escolha':
    case 'reagendar_slot_escolha':
      return (ctx.availableSlots?.length ?? 0) + 1

    case 'agendar_dia_lista':
    case 'reagendar_dia_lista':
      return (ctx.availableDays?.length ?? 0) + (ctx.dayListHasMore ? 1 : 0) + 1

    case 'agendar_hora_lista':
    case 'reagendar_hora_lista':
      return (ctx.availableSlots?.length ?? 0) + 2

    case 'cancelar_qual':
    case 'reagendar_qual':
      return (ctx.appointments?.length ?? 0) + 1

    default:
      return null
  }
}

function baseIdentityContext(ctx: BotContext): BotContext {
  return {
    patientPhone: ctx.patientPhone,
    patientName: ctx.patientName,
    patientCpf: ctx.patientCpf,
  }
}

function buildScheduleConfirmationMessage(params: {
  ctx: BotContext
  slot: Slot
}): string {
  const { ctx, slot } = params

  const slotLabel = slot.label || formatSlotLabel(new Date(slot.startsAt))
  const dayLabel = ctx.selectedDayLabel
    || (slotLabel.includes('às') ? slotLabel.split('às')[0].trim() : undefined)

  return templates.scheduleConfirmSelection({
    dayLabel,
    timeLabel: slot.label,
    patientName: ctx.patientName,
  })
}

function detectScheduleEditField(message: string): 'day' | 'time' | 'patient' | 'unknown' {
  const normalized = normalizeChoiceText(message)

  if (!normalized) return 'unknown'

  if (
    normalized === '1' ||
    normalized.includes('data') ||
    normalized.includes('dia')
  ) {
    return 'day'
  }

  if (
    normalized === '2' ||
    normalized.includes('horario') ||
    normalized.includes('hora')
  ) {
    return 'time'
  }

  if (
    normalized === '3' ||
    normalized.includes('paciente') ||
    normalized.includes('nome') ||
    normalized.includes('filha') ||
    normalized.includes('filho')
  ) {
    return 'patient'
  }

  return 'unknown'
}

function deriveScheduleDayContext(ctx: BotContext): {
  selectedDay?: string
  selectedDayLabel?: string
} {
  if (ctx.selectedDay && ctx.selectedDayLabel) {
    return {
      selectedDay: ctx.selectedDay,
      selectedDayLabel: ctx.selectedDayLabel,
    }
  }

  if (ctx.selectedDay) {
    return {
      selectedDay: ctx.selectedDay,
      selectedDayLabel: formatDayLabelFromDate(ctx.selectedDay),
    }
  }

  if (ctx.pendingScheduleSlot?.startsAt) {
    const selectedDay = ctx.pendingScheduleSlot.startsAt.slice(0, 10)
    return {
      selectedDay,
      selectedDayLabel: formatDayLabelFromDate(selectedDay),
    }
  }

  return {
    selectedDay: undefined,
    selectedDayLabel: undefined,
  }
}

function formatDayLabelFromDate(dateText: string): string {
  const parsed = new Date(`${dateText}T12:00:00`)
  const label = format(parsed, 'EEEE, dd/MM', { locale: ptBR })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function askForAppointmentCpf(
  ctx: BotContext,
  intent: 'cancel' | 'reschedule' | 'view_appointments',
): BotResponse {
  return {
    message: templates.appointmentsAskCpf,
    nextState: 'consultar_cpf',
    nextContext: {
      ...baseIdentityContext(ctx),
      intent,
    },
  }
}

async function shouldAskCpfForAppointmentLookup(
  ctx: BotContext,
  clinicId?: string,
): Promise<boolean> {
  if (!clinicId || ctx.patientCpf) {
    return false
  }

  return hasGestaoDSIntegration(clinicId)
}

async function buildAppointmentLookupResponse(params: {
  intent?: string
  ctx: BotContext
  appointments: BotContext['appointments']
  clinicId?: string
  botSettings?: BotSettings | null
}): Promise<BotResponse> {
  const appointments = params.appointments ?? []
  const nextContext = {
    ...params.ctx,
    appointments,
    appointmentId: appointments.length === 1 ? appointments[0].id : undefined,
  }

  if (appointments.length === 0) {
    const message = params.intent === 'view_appointments'
      ? templates.viewAppointmentsNotFound
      : templates.cancelNoAppointments

    return {
      message,
      nextState: 'menu',
      nextContext: baseIdentityContext(nextContext),
    }
  }

  if (params.intent === 'reschedule') {
    if (appointments.length > 1) {
      return {
        message: templates.whichAppointmentReschedule(appointments),
        nextState: 'reagendar_qual',
        nextContext: { ...nextContext, intent: 'reschedule' },
      }
    }

    return showDayList({
      clinicId: params.clinicId,
      botSettings: params.botSettings,
      ctx: { ...nextContext, intent: 'reschedule', appointmentId: appointments[0].id },
      flow: 'reagendar',
      offset: 0,
    })
  }

  if (params.intent === 'cancel') {
    if (appointments.length > 1) {
      return {
        message: templates.whichAppointmentCancel(appointments),
        nextState: 'cancelar_qual',
        nextContext: { ...nextContext, intent: 'cancel' },
      }
    }

    return {
      message: templates.cancelConfirmSingle(appointments[0]),
      nextState: 'cancelar_confirmar',
      nextContext: { ...nextContext, intent: 'cancel', appointmentId: appointments[0].id },
    }
  }

  return {
    message: templates.viewAppointments(appointments),
    nextState: 'ver_agendamentos',
    nextContext: { ...nextContext, intent: 'view_appointments' },
  }
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

  if (deduped.length < 1) return null

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
