/**
 * Shared webhook processing core.
 *
 * Contains all provider-agnostic business logic that runs after a webhook
 * payload has been parsed by a provider-specific parser (Z-API or Evolution).
 *
 * Both /api/webhooks/zapi and /api/webhooks/evolution import from here so the
 * bot, reminder, and appointment flows stay in sync between providers.
 */

import { after, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ParsedWebhookMessage, ParsedConnectionStatusWebhook } from '@/lib/zapi/webhookParser'
import {
  handleIncomingMessage,
  saveFromMeMessage,
  logWebhookActivity,
} from '@/lib/services/inboxService'
import {
  handleBotTurn,
  sendBotResponse,
  buildMenuMessage,
  type BotState,
  type BotContext,
} from '@/lib/bot/engine'
import { detectIntent } from '@/lib/bot/intent'
import {
  cancelAppointment,
  confirmAppointmentAttendance,
  getPatientAppointments,
} from '@/lib/bot/actions'
import {
  getBotSettings,
  isWithinWorkingHours,
  getNextWorkingTime,
} from '@/lib/services/botSettingsService'
import { sendInternalZapiMessage } from '@/lib/zapi/internalSend'
import { sendPushToClinicUsers } from '@/lib/services/pushService'
import { createNotification } from '@/lib/services/notificationService'
import {
  findLatestActionableReminder,
  getReminderContext,
  markReminderResponded,
  parseNotificationActionId,
  sendClinicNotificationMessage,
  sendPostCancellationPrompt,
} from '@/lib/services/appointmentNotificationService'
import { getConversationMode } from '@/lib/conversations/mode'
import {
  acquireBotProcessingLock,
  releaseBotProcessingLock,
} from '@/lib/services/botProcessingLock'
import {
  formatAppointmentAlertLabel,
  formatAppointmentDateTime,
} from '@/lib/utils/appointmentDateTime'

// ---------------------------------------------------------------------------
// Connection status handler
// ---------------------------------------------------------------------------

export async function handleConnectionStatusWebhook(
  parsedStatus: ParsedConnectionStatusWebhook,
): Promise<NextResponse> {
  const supabase = createAdminClient()

  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('id, clinic_id, client_token, status')
    .eq('instance_id', parsedStatus.instanceId)
    .single()

  if (instanceError || !instance) {
    console.error('[Webhook] Status event for unknown instance:', parsedStatus.instanceId)
    return NextResponse.json({ error: 'Instance not registered' }, { status: 404 })
  }

  if (parsedStatus.token && instance.client_token && parsedStatus.token !== instance.client_token) {
    console.warn('[Webhook] Invalid token for status event:', parsedStatus.instanceId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (parsedStatus.status !== instance.status) {
    const { error: updateError } = await supabase
      .from('whatsapp_instances')
      .update({ status: parsedStatus.status, updated_at: new Date().toISOString() })
      .eq('id', instance.id)

    if (updateError) {
      console.error('[Webhook] Failed to update status from webhook:', updateError)
    } else {
      console.log('[Webhook] Instance status updated:', {
        instanceId: parsedStatus.instanceId,
        from: instance.status,
        to: parsedStatus.status,
      })
    }
  }

  return NextResponse.json({ ok: true, statusUpdated: true, status: parsedStatus.status })
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

export async function handleMessageWebhook(
  parsed: ParsedWebhookMessage,
  rawPayload: unknown,
): Promise<NextResponse> {
  // 1. Handle fromMe (secretary's own messages)
  if (!shouldProcess(parsed)) {
    if (parsed.isFromMe && parsed.phone && parsed.phone.length >= 8) {
      const supabaseFromMe = createAdminClient()
      const { data: instanceFromMe } = await supabaseFromMe
        .from('whatsapp_instances')
        .select('clinic_id')
        .eq('instance_id', parsed.instanceId)
        .single()

      if (instanceFromMe?.clinic_id) {
        await saveFromMeMessage({
          supabase: supabaseFromMe,
          clinicId: instanceFromMe.clinic_id,
          phone: parsed.phone,
          text: parsed.messageText,
          zapiMessageId: parsed.messageId,
          timestamp: parsed.timestamp ? Math.floor(parsed.timestamp.getTime() / 1000) : null,
        })
      }
    } else {
      console.log('[Webhook] Skipping (fromMe or invalid):', {
        instanceId: parsed.instanceId,
        phone: parsed.phone,
        isFromMe: parsed.isFromMe,
      })
    }
    return NextResponse.json({ ok: true, skipped: true })
  }

  // 2. Find instance + validate token
  const supabase = createAdminClient()
  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('id, clinic_id, client_token')
    .eq('instance_id', parsed.instanceId)
    .single()

  if (instanceError || !instance) {
    console.error('[Webhook] Instance not found:', parsed.instanceId)
    return NextResponse.json({ error: 'Instance not registered' }, { status: 404 })
  }

  if (parsed.token && instance.client_token) {
    if (parsed.token !== instance.client_token) {
      console.warn('[Webhook] Invalid token for instance:', parsed.instanceId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const clinicId = instance.clinic_id

  if (parsed.messageText === '[Mensagem sem texto]') {
    console.log('[Webhook] DEBUG raw payload (no text):', JSON.stringify(rawPayload, null, 2).substring(0, 2000))
  }

  console.log('[Webhook] Processing message:', {
    instanceId: parsed.instanceId,
    clinicId,
    phone: parsed.phone,
    textPreview: parsed.messageText.substring(0, 80),
    normalizedPreview: (parsed.normalizedText || parsed.messageText).substring(0, 80),
  })

  // 3. Persist incoming message
  const result = await handleIncomingMessage({
    clinicId,
    phone: parsed.phone,
    name: parsed.name,
    text: parsed.messageText,
    zapiMessageId: parsed.messageId,
    timestamp: parsed.timestamp,
  })

  // 4. Log activity (non-blocking)
  logWebhookActivity({
    level: result.success ? 'info' : 'error',
    action: 'whatsapp.webhook.received',
    phone: parsed.phone,
    conversationId: result.conversationId || null,
    details: {
      instance_id: parsed.instanceId,
      clinic_id: clinicId,
      phone: parsed.phone,
      has_text: !!parsed.messageText && parsed.messageText !== '[Mensagem sem texto]',
      created_conversation: result.createdConversation,
      success: result.success,
      error: result.error,
    },
  }).catch(() => {})

  if (!result.success) {
    console.error('[Webhook] Failed to process message:', result.error)
    return NextResponse.json(
      { error: 'Failed to process message', message: result.error },
      { status: 500 },
    )
  }

  console.log('[Webhook] Message processed:', {
    conversationId: result.conversationId,
    messageId: result.messageId,
    createdConversation: result.createdConversation,
  })

  // 5. Notification / reminder response check
  const reminderActionResult = await tryHandleNotificationResponse({
    clinicId,
    phone: parsed.phone,
    conversationId: result.conversationId || null,
    interactiveReplyId: parsed.interactiveReplyId,
    normalizedText: parsed.normalizedText || parsed.messageText,
  })

  if (reminderActionResult.handled) {
    return NextResponse.json({
      ok: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
      reminderAction: reminderActionResult.action,
    })
  }

  // 6. Trigger bot asynchronously (after response lifecycle)
  const conversationId = result.conversationId
  const botInput = parsed.normalizedText || parsed.messageText
  const shouldTriggerBot =
    !!conversationId &&
    !!botInput &&
    botInput !== '[Mensagem sem texto]' &&
    (!botInput.startsWith('[') || botInput === '[Áudio]' || botInput === '[Vídeo]')

  if (shouldTriggerBot) {
    const triggerMessageId = result.messageId

    after(async () => {
      console.log('[Webhook] Running deferred bot response:', {
        conversationId,
        phone: parsed.phone,
        inputPreview: botInput.substring(0, 80),
      })

      await triggerBotResponseSafe(
        conversationId!,
        parsed.phone,
        botInput,
        clinicId,
        result.createdConversation ?? false,
        triggerMessageId,
      )
    })
  }

  return NextResponse.json({
    ok: true,
    conversationId: result.conversationId,
    messageId: result.messageId,
  })
}

// ---------------------------------------------------------------------------
// Helpers (all private to this module)
// ---------------------------------------------------------------------------

function shouldProcess(parsed: ParsedWebhookMessage): boolean {
  if (parsed.isFromMe) return false
  if (!parsed.phone || parsed.phone.length < 8) return false
  return true
}

function normalizeNotificationReply(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

function inferReminderActionFromText(value: string): 'confirm' | 'cancel' | null {
  const n = normalizeNotificationReply(value)
  if (/^(sim|confirmar|confirmo|confirmada|confirmado|ok|presenca|confirmar presenca)$/.test(n))
    return 'confirm'
  if (/^(nao|nao confirmar|cancelar|desmarcar|cancelar consulta)$/.test(n)) return 'cancel'
  return null
}

function normalizeMenuFreeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function isGreetingLikeMessage(value: string): boolean {
  return /^(oi|ola|olá|bom dia|boa tarde|boa noite|menu|inicio|início|0)$/.test(
    normalizeMenuFreeText(value),
  )
}

async function updateConversationStatus(params: {
  conversationId?: string | null
  status: string
  botEnabled?: boolean
  botState?: BotState
  botContext?: BotContext
}) {
  if (!params.conversationId) return
  const supabase = createAdminClient()
  const payload: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  }
  if (typeof params.botEnabled === 'boolean') payload.bot_enabled = params.botEnabled
  if (params.botState) payload.bot_state = params.botState
  if (params.botContext) payload.bot_context = params.botContext
  await supabase.from('conversations').update(payload).eq('id', params.conversationId)
}

async function createAppointmentActionNotification(params: {
  clinicId: string
  conversationId?: string | null
  appointmentId: string
  type: 'appointment_confirmed' | 'appointment_canceled'
  title: string
  patientName: string
  startsAt: string
}) {
  const message = `${params.patientName} respondeu pela notificacao da consulta de ${formatAppointmentAlertLabel(params.startsAt)}.`
  await createNotification(params.clinicId, params.type, params.title, message, {
    appointmentId: params.appointmentId,
    conversationId: params.conversationId || undefined,
    link: params.conversationId
      ? `/dashboard/conversas?id=${params.conversationId}`
      : '/dashboard/agenda',
  })
}

async function handleNotificationRescheduleAction(params: {
  clinicId: string
  phone: string
  conversationId?: string | null
  appointmentId: string
}): Promise<boolean> {
  if (!params.conversationId) {
    const fallback = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      text: 'Recebi seu pedido de remarcar. Responda "menu" para continuar pelo bot ou fale com a secretaria.',
    })
    return fallback.success
  }

  const supabase = createAdminClient()
  const botSettings = await getBotSettings(params.clinicId)
  if (!botSettings) return false

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, starts_at, status, appointment_type, patient_name')
    .eq('id', params.appointmentId)
    .maybeSingle()

  if (!appointment) {
    const missing = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId: params.conversationId,
      text: 'Nao encontrei essa consulta para remarcar. Pode me mandar "menu" para recomeçar?',
      messageSource: 'notification_reschedule_missing',
    })
    return missing.success
  }

  if (botSettings.bot_handles_reschedule === false) {
    await updateConversationStatus({
      conversationId: params.conversationId,
      status: 'waiting_human',
      botEnabled: false,
    })

    await createNotification(
      params.clinicId,
      'conversation_waiting',
      'Paciente solicitou remarcacao',
      'A secretaria precisa assumir a remarcacao iniciada por uma notificacao automatica.',
      {
        conversationId: params.conversationId,
        link: `/dashboard/conversas?id=${params.conversationId}`,
      },
    )

    const transfer = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId: params.conversationId,
      text: 'Perfeito. Vou encaminhar sua remarcacao para a secretaria agora.',
      messageSource: 'notification_reschedule_handoff',
    })

    return transfer.success
  }

  const appointmentLabel = formatAppointmentDateTime(appointment.starts_at)

  const response = await handleBotTurn(
    params.conversationId,
    'remarcar consulta',
    'ver_agendamento_selecionado',
    {
      patientPhone: params.phone,
      patientName: appointment.patient_name || undefined,
      appointmentId: appointment.id,
      appointments: [
        {
          id: appointment.id,
          startsAt: appointment.starts_at,
          label: appointmentLabel,
          status: appointment.status,
          appointmentType:
            (appointment.appointment_type as 'particular' | 'convenio' | null) ?? null,
        },
      ],
      selectedAppointmentIndex: 0,
      intent: 'reschedule',
    },
    botSettings,
    params.phone,
    params.clinicId,
  )

  return sendBotResponse(params.conversationId, params.phone, response, params.clinicId)
}

async function tryHandleNotificationResponse(params: {
  clinicId: string
  phone: string
  conversationId?: string | null
  interactiveReplyId?: string | null
  normalizedText: string
}): Promise<{ handled: boolean; action?: string }> {
  const parsedAction = parseNotificationActionId(params.interactiveReplyId)
  const typedIntent = parsedAction ? null : inferReminderActionFromText(params.normalizedText)

  let reminderId: string | null = null
  let actionKind: 'confirm' | 'cancel' | 'reschedule' | 'no_reschedule' | null = null
  let appointmentIdFromAction: string | null = null

  if (parsedAction?.kind === 'confirm' || parsedAction?.kind === 'cancel') {
    reminderId = parsedAction.reminderId
    actionKind = parsedAction.kind
  } else if (parsedAction?.kind === 'reschedule' || parsedAction?.kind === 'no_reschedule') {
    appointmentIdFromAction = parsedAction.appointmentId
    actionKind = parsedAction.kind
  } else if (typedIntent) {
    const latestReminder = await findLatestActionableReminder({
      clinicId: params.clinicId,
      phone: params.phone,
    })
    if (!latestReminder) return { handled: false }
    reminderId = latestReminder.id
    actionKind = typedIntent
  }

  if (!actionKind) return { handled: false }

  if (actionKind === 'no_reschedule' && appointmentIdFromAction) {
    const handled = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId: params.conversationId,
      text: 'Perfeito. Consulta cancelada e registrada. Se precisar no futuro, estou por aqui.',
      messageSource: 'notification_no_reschedule',
    })
    return { handled: handled.success, action: 'no-reschedule' }
  }

  if (actionKind === 'reschedule' && appointmentIdFromAction) {
    const handled = await handleNotificationRescheduleAction({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId: params.conversationId,
      appointmentId: appointmentIdFromAction,
    })
    return { handled, action: 'reschedule' }
  }

  if (!reminderId) return { handled: false }

  const reminderContext = await getReminderContext(reminderId)
  if (!reminderContext?.appointment) return { handled: false }

  const { reminder, appointment } = reminderContext
  const conversationId =
    params.conversationId || reminder.conversation_id || appointment.conversation_id || null

  if (reminder.response_received) {
    const alreadyHandled = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId,
      text: 'Ja registramos sua resposta para essa notificacao.',
      messageSource: 'notification_duplicate_reply',
    })
    return { handled: alreadyHandled.success, action: 'already-recorded' }
  }

  if (actionKind === 'confirm') {
    if (appointment.status === 'confirmed') {
      await markReminderResponded({ reminderId, response: 'confirmar' })
      const alreadyConfirmed = await sendClinicNotificationMessage({
        clinicId: params.clinicId,
        phone: params.phone,
        conversationId,
        text: 'Essa consulta ja esta confirmada.',
        messageSource: 'notification_already_confirmed',
      })
      return { handled: alreadyConfirmed.success, action: 'already-confirmed' }
    }

    const confirmation = await confirmAppointmentAttendance(params.clinicId, appointment.id)
    if (!confirmation.success) {
      const failed = await sendClinicNotificationMessage({
        clinicId: params.clinicId,
        phone: params.phone,
        conversationId,
        text: confirmation.message,
        messageSource: 'notification_confirm_failed',
      })
      return { handled: failed.success, action: 'confirm-failed' }
    }

    await markReminderResponded({ reminderId, response: 'confirmar' })
    await updateConversationStatus({ conversationId, status: 'scheduled' })
    await createAppointmentActionNotification({
      clinicId: params.clinicId,
      conversationId,
      appointmentId: appointment.id,
      type: 'appointment_confirmed',
      title: 'Paciente confirmou presenca',
      patientName: appointment.patient_name,
      startsAt: appointment.starts_at,
    })

    const sent = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId,
      text: confirmation.message,
      messageSource: 'notification_confirm_success',
    })
    return { handled: sent.success, action: 'confirmed' }
  }

  // cancel
  if (appointment.status === 'canceled') {
    await markReminderResponded({ reminderId, response: 'cancelar' })
    const alreadyCanceled = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId,
      text: 'Essa consulta ja esta cancelada.',
      messageSource: 'notification_already_canceled',
    })
    return { handled: alreadyCanceled.success, action: 'already-canceled' }
  }

  const cancellation = await cancelAppointment(params.clinicId, appointment.id)
  if (!cancellation.success) {
    const failed = await sendClinicNotificationMessage({
      clinicId: params.clinicId,
      phone: params.phone,
      conversationId,
      text: cancellation.message,
      messageSource: 'notification_cancel_failed',
    })
    return { handled: failed.success, action: 'cancel-failed' }
  }

  await markReminderResponded({ reminderId, response: 'cancelar' })
  await updateConversationStatus({ conversationId, status: 'canceled' })
  await createAppointmentActionNotification({
    clinicId: params.clinicId,
    conversationId,
    appointmentId: appointment.id,
    type: 'appointment_canceled',
    title: 'Paciente cancelou consulta',
    patientName: appointment.patient_name,
    startsAt: appointment.starts_at,
  })

  const prompt = await sendPostCancellationPrompt({
    clinicId: params.clinicId,
    phone: params.phone,
    appointmentId: appointment.id,
    conversationId,
  })
  return { handled: prompt.success, action: 'canceled' }
}

async function triggerBotResponseSafe(
  conversationId: string,
  phone: string,
  messageText: string,
  clinicId: string,
  isFirstContact = false,
  triggerMessageId?: string,
): Promise<void> {
  const supabase = createAdminClient()
  const acquiredLock = await acquireBotProcessingLock(conversationId)

  if (!acquiredLock) {
    await logWebhookActivity({
      level: 'warn',
      action: 'bot.lock.skipped',
      phone,
      conversationId,
      details: { clinic_id: clinicId },
    })
    return
  }

  try {
    const { data: conversation } = await supabase
      .from('conversations')
      .select('bot_enabled, bot_state, bot_context, status, cpf, patient_name')
      .eq('id', conversationId)
      .maybeSingle()

    if (!conversation) return

    const conversationMode = getConversationMode({
      bot_enabled: conversation.bot_enabled,
      status: conversation.status,
    })

    if (conversationMode === 'human') {
      const patientLabel = conversation.patient_name || phone
      sendPushToClinicUsers({
        clinicId,
        payload: {
          title: 'Nova mensagem de paciente',
          body: `${patientLabel}: ${messageText.slice(0, 100)}`,
          url: '/dashboard/conversas',
          tag: `conv-${conversationId}`,
        },
      }).catch((err: unknown) => console.error('[Push] Failed to notify staff:', err))

      await logWebhookActivity({
        level: 'info',
        action: 'bot.silenced.human_mode',
        phone,
        conversationId,
        details: { clinic_id: clinicId, status: conversation.status },
      })
      return
    }

    const currentState = (conversation.bot_state || 'menu') as BotState
    const currentContext = (conversation.bot_context || {}) as BotContext

    if (conversationMode === 'bot' && currentState === 'menu') {
      const intent = detectIntent(messageText)
      const normalizedFreeText = normalizeMenuFreeText(messageText)

      if (intent === 'other' && !isGreetingLikeMessage(messageText)) {
        const botSettings = await getBotSettings(clinicId)
        if (!botSettings) return

        if (currentContext.menuGuidanceSentAt) {
          await supabase
            .from('conversations')
            .update({
              bot_context: {
                ...currentContext,
                patientPhone: phone,
                patientName: currentContext.patientName || undefined,
                patientCpf: currentContext.patientCpf || conversation.cpf || undefined,
                lastIgnoredFreeText: normalizedFreeText.slice(0, 160),
                lastIgnoredFreeTextAt: new Date().toISOString(),
                ignoredFreeTextCount: (currentContext.ignoredFreeTextCount ?? 1) + 1,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId)

          await logWebhookActivity({
            level: 'warn',
            action: 'bot.silenced.free_text',
            phone,
            conversationId,
            details: {
              clinic_id: clinicId,
              ignored_count: (currentContext.ignoredFreeTextCount ?? 1) + 1,
            },
          })
          return
        }

        const guidancePrefix =
          isFirstContact && botSettings.message_welcome?.trim()
            ? `${botSettings.message_welcome.trim()}\n\n`
            : ''

        await sendBotResponse(
          conversationId,
          phone,
          {
            message: `${guidancePrefix}${botSettings.message_fallback}\n\n${buildMenuMessage(botSettings)}`,
            nextState: 'menu',
            nextContext: {
              ...currentContext,
              patientPhone: phone,
              patientName: currentContext.patientName || undefined,
              patientCpf: currentContext.patientCpf || conversation.cpf || undefined,
              menuGuidanceSentAt: new Date().toISOString(),
              lastIgnoredFreeText: normalizedFreeText.slice(0, 160),
              lastIgnoredFreeTextAt: new Date().toISOString(),
              ignoredFreeTextCount: 1,
            },
          },
          clinicId,
        )

        await logWebhookActivity({
          level: 'info',
          action: 'bot.guided.free_text_once',
          phone,
          conversationId,
          details: { clinic_id: clinicId },
        })
        return
      }

      if (currentContext.menuGuidanceSentAt) {
        await supabase
          .from('conversations')
          .update({
            bot_context: {
              ...currentContext,
              menuGuidanceSentAt: undefined,
              lastIgnoredFreeText: undefined,
              lastIgnoredFreeTextAt: undefined,
              ignoredFreeTextCount: undefined,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
      }
    }

    await triggerBotResponse(
      conversationId,
      phone,
      messageText,
      clinicId,
      isFirstContact,
      triggerMessageId,
    )
  } finally {
    await releaseBotProcessingLock(conversationId)
  }
}

async function triggerBotResponse(
  conversationId: string,
  phone: string,
  messageText: string,
  clinicId: string,
  isFirstContact = false,
  triggerMessageId?: string,
): Promise<void> {
  const supabase = createAdminClient()

  await new Promise(r => setTimeout(r, 300))

  if (triggerMessageId) {
    const { data: latestMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('sender', 'patient')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestMsg && latestMsg.id !== triggerMessageId) {
      console.log('[Bot] Debounce: newer message arrived, skipping', triggerMessageId)
      return
    }
  }

  {
    const cutoff = new Date(Date.now() - 5000).toISOString()
    const { data: recentBotMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('sender', 'bot')
      .gte('created_at', cutoff)
      .limit(1)
      .maybeSingle()

    if (recentBotMsg) {
      console.log('[Bot] Rate-limit: bot already responded in last 5s, skipping', conversationId)
      return
    }
  }

  try {
    const botSettings = await getBotSettings(clinicId)
    if (!botSettings) {
      console.log('[Bot] No bot settings found:', clinicId)
      return
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('bot_enabled, bot_state, bot_context, status, created_at, updated_at, cpf, patient_name')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      console.log('[Bot] Conversation not found:', conversationId)
      return
    }

    if (!conversation.bot_enabled) {
      if (conversation.status === 'waiting_human' || conversation.status === 'in_progress') {
        console.log('[Bot] Human attendant active — bot silent:', conversationId)
        const patientLabel = conversation.patient_name || phone
        sendPushToClinicUsers({
          clinicId,
          payload: {
            title: '💬 Nova mensagem de paciente',
            body: `${patientLabel}: ${messageText.slice(0, 100)}`,
            url: '/dashboard/conversas',
            tag: `conv-${conversationId}`,
          },
        }).catch((err: unknown) => console.error('[Push] Failed to notify staff:', err))
        return
      }

      const msgLower = messageText.trim().toLowerCase()
      const isReactivate =
        /^(menu|inicio|início|oi|olá|ola|0)$/.test(msgLower) ||
        /\bmenu principal\b/.test(msgLower)

      if (isReactivate) {
        await supabase
          .from('conversations')
          .update({ bot_enabled: true, bot_state: 'menu' })
          .eq('id', conversationId)
        const menuResponse = {
          message: buildMenuMessage(botSettings),
          nextState: 'menu' as BotState,
          nextContext: { patientPhone: phone } as BotContext,
        }
        await sendBotResponse(conversationId, phone, menuResponse, clinicId)
        console.log('[Bot] Reactivated by menu keyword:', conversationId)
      } else {
        console.log('[Bot] Bot disabled:', conversationId)
      }
      return
    }

    if (conversation.status === 'waiting_human') {
      const msgLower = messageText.trim().toLowerCase()
      const wantsMenu =
        /^(menu|inicio|início|0)$/.test(msgLower) ||
        /\bmenu principal\b/.test(msgLower) ||
        /\bvoltar\b/.test(msgLower)

      if (wantsMenu) {
        const { data: humanMessages } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('sender', 'human')
          .limit(1)

        const humanHasResponded = humanMessages && humanMessages.length > 0

        if (!humanHasResponded) {
          await supabase
            .from('conversations')
            .update({
              bot_enabled: true,
              bot_state: 'menu',
              status: 'in_progress',
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId)
          const menuResponse = {
            message: buildMenuMessage(botSettings),
            nextState: 'menu' as BotState,
            nextContext: { patientPhone: phone } as BotContext,
          }
          await sendBotResponse(conversationId, phone, menuResponse, clinicId)
          console.log('[Bot] Patient returned to menu (no human had responded):', conversationId)
          return
        }
      }

      const patientLabel = conversation.patient_name || phone
      sendPushToClinicUsers({
        clinicId,
        payload: {
          title: '💬 Nova mensagem de paciente',
          body: `${patientLabel}: ${messageText.slice(0, 100)}`,
          url: '/dashboard/conversas',
          tag: `conv-${conversationId}`,
        },
      }).catch((err: unknown) => console.error('[Push] Failed to notify staff:', err))

      console.log('[Bot] Conversation waiting for human — bot silenced:', conversationId)
      return
    }

    const outsideHours =
      !botSettings.bot_respond_anytime &&
      botSettings.working_hours_enabled &&
      !isWithinWorkingHours(botSettings)

    if (outsideHours) {
      console.log('[Bot] Outside working hours, sending out-of-hours message')
      const nextTime = getNextWorkingTime(botSettings)
      const baseMessage = botSettings.message_out_of_hours
      const outOfHoursMessage = nextTime
        ? `${baseMessage}\n\n🕐 Retornaremos no atendimento *${nextTime}*.`
        : baseMessage
      await sendBotResponse(
        conversationId,
        phone,
        {
          message: outOfHoursMessage,
          nextState: (conversation.bot_state as BotState) || 'menu',
          nextContext: (conversation.bot_context as BotContext) || {},
        },
        clinicId,
      )
      return
    }

    const currentState = (conversation.bot_state || 'menu') as BotState
    let currentContext = (conversation.bot_context || {}) as BotContext
    currentContext = {
      ...currentContext,
      patientPhone: phone,
      patientName: currentContext.patientName || undefined,
      patientCpf: currentContext.patientCpf || conversation.cpf || undefined,
    }

    if (isFirstContact && botSettings.message_welcome?.trim()) {
      const welcomeText = botSettings.message_welcome.trim()
      const welcomeResult = await sendInternalZapiMessage({
        clinicId,
        conversationId,
        phone,
        text: welcomeText,
      })
      if (!welcomeResult.success) {
        console.error('[Bot] Failed to send welcome message:', welcomeResult.error)
      } else {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender: 'bot',
          content: welcomeText,
          zapi_message_id: welcomeResult.messageId || null,
          message_type: 'text',
          delivery_status: 'sent',
          direction: 'outbound',
          origin: 'bot',
          external_status: 'sent',
          reconciled_at: new Date().toISOString(),
          webhook_seen: false,
          sent_by_me_seen: false,
          metadata: { source: 'bot_welcome' },
          created_at: new Date().toISOString(),
        })
      }
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500))
    // This covers: menu intent for cancel/reschedule/view, and the ver_agendamentos state.
    // We do it ONCE here so the engine always receives real data without extra round-trips.
    if (!currentContext.appointments) {
      const intentRaw = messageText.toLowerCase()
      const stateNeedsAppointments =
        currentState === 'ver_agendamentos' ||
        (currentState === 'menu' &&
          (intentRaw.includes('cancelar') ||
            intentRaw.includes('desmarcar') ||
            intentRaw.includes('remarcar') ||
            intentRaw.includes('reagendar') ||
            intentRaw.includes('ver') ||
            intentRaw.includes('agendamento') ||
            /\b[2-5]\b/.test(intentRaw)))

      if (stateNeedsAppointments) {
        const appointments = await getPatientAppointments(
          clinicId,
          phone,
          currentContext.patientCpf,
        )
        currentContext = {
          ...currentContext,
          appointments,
          appointmentId: appointments.length === 1 ? appointments[0].id : undefined,
        }
      }
    }

    console.log('[Bot] Processing message:', {
      conversationId,
      state: currentState,
      text: messageText.substring(0, 50),
    })

    const response = await handleBotTurn(
      conversationId,
      messageText,
      currentState,
      currentContext,
      botSettings,
      phone,
      clinicId,
    )

    // Human-like typing delay before responding.
    // Scales with response length: ~40ms/char, clamped to 1500–4000ms.
    {
      const responseLength = (response.message?.length || 0) + (response.preambleMessage?.length || 0)
      const typingMs = Math.min(Math.max(responseLength * 40, 1500), 4000)
      await new Promise(r => setTimeout(r, typingMs))
    }

    const sent = await sendBotResponse(conversationId, phone, response, clinicId)
    if (sent) {
      console.log('[Bot] Response sent:', { conversationId, nextState: response.nextState })
    } else {
      console.error('[Bot] Failed to send response:', conversationId)
    }
  } catch (error) {
    console.error('[Bot] Error in triggerBotResponse:', error)
    try {
      await supabase.from('logs').insert({
        clinic_id: clinicId,
        event: 'bot.trigger.failed',
        level: 'error',
        metadata: {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    } catch {
      // Ignore logging errors
    }
  }
}
