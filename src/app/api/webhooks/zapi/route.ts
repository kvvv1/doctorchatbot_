import { after, NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseConnectionStatusWebhook, parseWebhookPayload, shouldProcessWebhook } from '@/lib/zapi/webhookParser'
import { handleIncomingMessage, saveFromMeMessage, logWebhookActivity } from '@/lib/services/inboxService'
import { handleBotTurn, sendBotResponse, buildMenuMessage, type BotState, type BotContext } from '@/lib/bot/engine'
import { detectIntent } from '@/lib/bot/intent'
import { cancelAppointment, confirmAppointmentAttendance, getPatientAppointments } from '@/lib/bot/actions'
import { getBotSettings, isWithinWorkingHours, getNextWorkingTime } from '@/lib/services/botSettingsService'
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
import { acquireBotProcessingLock, releaseBotProcessingLock } from '@/lib/services/botProcessingLock'

/**
 * POST /api/webhooks/zapi
 * 
 * Receives incoming WhatsApp messages from Z-API webhook.
 * 
 * Security:
 * - Validates instanceId + token from payload against database
 * 
 * Flow:
 * 1. Parse and validate payload
 * 2. Find and authenticate instance by instanceId + token
 * 3. Process and persist message
 * 4. Trigger bot if enabled
 * 5. Return quick response
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    let payload: unknown
    try {
      payload = await request.json()
    } catch (error) {
      console.error('[Z-API Webhook] Invalid JSON payload:', error)
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      )
    }

    // 2. Parse and process connection status webhooks (no phone/message)
    const parsedStatus = parseConnectionStatusWebhook(payload)
    if (parsedStatus) {
      const supabase = createAdminClient()

      const { data: instance, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('id, clinic_id, client_token, status')
        .eq('instance_id', parsedStatus.instanceId)
        .single()

      if (instanceError || !instance) {
        console.error('[Z-API Webhook] Status event for unknown instance:', parsedStatus.instanceId)
        return NextResponse.json(
          { error: 'Instance not registered' },
          { status: 404 }
        )
      }

      if (parsedStatus.token && instance.client_token && parsedStatus.token !== instance.client_token) {
        console.warn('[Z-API Webhook] Invalid token for status event:', parsedStatus.instanceId)
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      if (parsedStatus.status !== instance.status) {
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update({
            status: parsedStatus.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', instance.id)

        if (updateError) {
          console.error('[Z-API Webhook] Failed to update status from webhook:', updateError)
        } else {
          console.log('[Z-API Webhook] Instance status updated from webhook:', {
            instanceId: parsedStatus.instanceId,
            from: instance.status,
            to: parsedStatus.status,
          })
        }
      }

      return NextResponse.json({
        ok: true,
        statusUpdated: true,
        status: parsedStatus.status,
      })
    }

    // 3. Parse and validate message webhook payload
    let parsed
    try {
      parsed = parseWebhookPayload(payload)
    } catch (error) {
      console.error('[Z-API Webhook] Failed to parse payload:', error)
      return NextResponse.json(
        { error: 'Invalid webhook payload', message: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 }
      )
    }

    // 4. Check if we should process this webhook
    if (!shouldProcessWebhook(parsed)) {
      // If this is a message sent from the secretary's own phone (fromMe),
      // save it to the existing conversation so it appears in the chat.
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
        console.log('[Z-API Webhook] Skipping webhook (fromMe or invalid):', {
          instanceId: parsed.instanceId,
          phone: parsed.phone,
          isFromMe: parsed.isFromMe,
        })
      }
      return NextResponse.json({ ok: true, skipped: true })
    }

    // 5. Find and authenticate instance by instance_id + token
    const supabase = createAdminClient()
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, clinic_id, client_token')
      .eq('instance_id', parsed.instanceId)
      .single()

    if (instanceError || !instance) {
      console.error('[Z-API Webhook] Instance not found:', parsed.instanceId)
      return NextResponse.json(
        { error: 'Instance not registered' },
        { status: 404 }
      )
    }

    // 6. Validate token (if provided in payload)
    if (parsed.token && instance.client_token) {
      if (parsed.token !== instance.client_token) {
        console.warn('[Z-API Webhook] Invalid token for instance:', parsed.instanceId)
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    const clinicId = instance.clinic_id

    // Temporary debug: log raw payload when text extraction fails
    if (parsed.messageText === '[Mensagem sem texto]') {
      console.log('[Z-API Webhook] DEBUG raw payload (no text extracted):', JSON.stringify(payload, null, 2).substring(0, 2000))
    }

    console.log('[Z-API Webhook] Processing message:', {
      instanceId: parsed.instanceId,
      clinicId,
      phone: parsed.phone,
      hasText: !!parsed.messageText,
      textPreview: parsed.messageText.substring(0, 80),
      normalizedPreview: (parsed.normalizedText || parsed.messageText).substring(0, 80),
    })

    // 7. Process incoming message
    const result = await handleIncomingMessage({
      clinicId,
      phone: parsed.phone,
      name: parsed.name,
      text: parsed.messageText,
      zapiMessageId: parsed.messageId,
      timestamp: parsed.timestamp,
    })

    // 8. Log activity (non-blocking)
    logWebhookActivity({
      level: result.success ? 'info' : 'error',
      action: 'zapi.webhook.received',
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
    }).catch(() => {
      // Ignore logging errors
    })

    // 9. Return response
    if (!result.success) {
      console.error('[Z-API Webhook] Failed to process message:', result.error)
      return NextResponse.json(
        { error: 'Failed to process message', message: result.error },
        { status: 500 }
      )
    }

    console.log('[Z-API Webhook] Message processed successfully:', {
      conversationId: result.conversationId,
      messageId: result.messageId,
      createdConversation: result.createdConversation,
    })

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

    // 10. Trigger bot response after the response lifecycle so Vercel keeps the task alive.
    const conversationId = result.conversationId

    // Only trigger bot when there is real user text.
    // '[Mensagem sem texto]' is a Z-API delivery/status notification — not a patient message.
    const botInput = parsed.normalizedText || parsed.messageText
    const shouldTriggerBot =
      !!conversationId &&
      !!botInput &&
      botInput !== '[Mensagem sem texto]' &&
      (!botInput.startsWith('[') || botInput === '[Áudio]' || botInput === '[Vídeo]')

    if (shouldTriggerBot) {
      // Capture the message ID so triggerBotResponse can verify it's still
      // the latest patient message before responding (flood/debounce guard).
      const triggerMessageId = result.messageId

      after(async () => {
        console.log('[Z-API Webhook] Running deferred bot response:', {
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
  } catch (error) {
    console.error('[Z-API Webhook] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function normalizeNotificationReply(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function inferReminderActionFromText(value: string): 'confirm' | 'cancel' | null {
  const normalized = normalizeNotificationReply(value)

  if (/^(sim|confirmar|confirmo|confirmada|confirmado|ok|presenca|confirmar presenca)$/.test(normalized)) {
    return 'confirm'
  }

  if (/^(nao|nao confirmar|cancelar|desmarcar|cancelar consulta)$/.test(normalized)) {
    return 'cancel'
  }

  return null
}

function normalizeMenuFreeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function isGreetingLikeMessage(value: string): boolean {
  const normalized = normalizeMenuFreeText(value)
  return /^(oi|ola|olá|bom dia|boa tarde|boa noite|menu|inicio|início|0)$/.test(normalized)
}

function formatAppointmentAlertDate(startsAt: string): string {
  return format(new Date(startsAt), "dd/MM 'as' HH:mm", { locale: ptBR })
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

  await supabase
    .from('conversations')
    .update(payload)
    .eq('id', params.conversationId)
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
  const message = `${params.patientName} respondeu pela notificacao da consulta de ${formatAppointmentAlertDate(params.startsAt)}.`

  await createNotification(
    params.clinicId,
    params.type,
    params.title,
    message,
    {
      appointmentId: params.appointmentId,
      conversationId: params.conversationId || undefined,
      link: params.conversationId
        ? `/dashboard/conversas?id=${params.conversationId}`
        : '/dashboard/agenda',
    }
  )
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

  if (!botSettings) {
    return false
  }

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
      }
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

  const appointmentLabel = format(
    new Date(appointment.starts_at),
    "EEE, dd/MM 'as' HH:mm",
    { locale: ptBR }
  )

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
          appointmentType: (appointment.appointment_type as 'particular' | 'convenio' | null) ?? null,
        },
      ],
      selectedAppointmentIndex: 0,
      intent: 'reschedule',
    },
    botSettings,
    params.phone,
    params.clinicId
  )

  return sendBotResponse(
    params.conversationId,
    params.phone,
    response,
    params.clinicId
  )
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
  } else if (
    parsedAction?.kind === 'reschedule' ||
    parsedAction?.kind === 'no_reschedule'
  ) {
    appointmentIdFromAction = parsedAction.appointmentId
    actionKind = parsedAction.kind
  } else if (typedIntent) {
    const latestReminder = await findLatestActionableReminder({
      clinicId: params.clinicId,
      phone: params.phone,
    })

    if (!latestReminder) {
      return { handled: false }
    }

    reminderId = latestReminder.id
    actionKind = typedIntent
  }

  if (!actionKind) {
    return { handled: false }
  }

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

  if (!reminderId) {
    return { handled: false }
  }

  const reminderContext = await getReminderContext(reminderId)
  if (!reminderContext?.appointment) {
    return { handled: false }
  }

  const { reminder, appointment } = reminderContext
  const conversationId = params.conversationId || reminder.conversation_id || appointment.conversation_id || null

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
      await markReminderResponded({
        reminderId,
        response: 'confirmar',
      })

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

    await markReminderResponded({
      reminderId,
      response: 'confirmar',
    })

    await updateConversationStatus({
      conversationId,
      status: 'scheduled',
    })

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

  if (appointment.status === 'canceled') {
    await markReminderResponded({
      reminderId,
      response: 'cancelar',
    })

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

  await markReminderResponded({
    reminderId,
    response: 'cancelar',
  })

  await updateConversationStatus({
    conversationId,
    status: 'canceled',
  })

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

        const guidancePrefix = isFirstContact && botSettings.message_welcome?.trim()
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

/**
 * Triggers bot response for a conversation (called asynchronously)
 */
async function triggerBotResponse(
  conversationId: string,
  phone: string,
  messageText: string,
  clinicId: string,
  isFirstContact = false,
  triggerMessageId?: string,
): Promise<void> {
  const supabase = createAdminClient()

  // Debounce guard: wait 300ms so any rapidly-following messages can land in DB,
  // then re-check — only the last message in a burst should trigger a bot response.
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
      console.log('[Bot] Debounce: newer message arrived, skipping response for', triggerMessageId)
      return
    }
  }

  // Rate-limit guard: if the bot already responded in the last 5 seconds, skip.
  // Prevents duplicate responses from parallel after() callbacks that both passed
  // the debounce check before the other's DB insert committed.
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
      console.log('[Bot] Rate-limit: bot already responded in last 5s, skipping for', conversationId)
      return
    }
  }

  try {
    // 1. Get bot settings for the clinic
    const botSettings = await getBotSettings(clinicId)
    
    if (!botSettings) {
      console.log('[Bot] No bot settings found for clinic:', clinicId)
      return
    }

    // 2. Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('bot_enabled, bot_state, bot_context, status, created_at, updated_at, cpf, patient_name')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      console.log('[Bot] Conversation not found:', conversationId)
      return
    }

    // 3. Check if bot is enabled
    if (!conversation.bot_enabled) {
      // Stay silent when a human attendant is actively attending the conversation
      // (waiting_human = bot has handed off; in_progress = secretary took over manually)
      if (conversation.status === 'waiting_human' || conversation.status === 'in_progress') {
        console.log('[Bot] Human attendant active — bot stays silent, ignoring reactivation attempt:', conversationId)
        // Notify clinic staff via push that patient sent a new message
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

      // Allow patient to re-engage the bot by typing "menu" / "0" / "início"
      const msgLower = messageText.trim().toLowerCase()
      const isReactivate = /^(menu|inicio|início|oi|olá|ola|0)$/.test(msgLower)
        || /\bmenu principal\b/.test(msgLower)
      if (isReactivate) {
        // Re-enable bot and send welcome menu
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
        console.log('[Bot] Bot reactivated by patient typing menu keyword:', conversationId)
      } else {
        console.log('[Bot] Bot disabled for conversation:', conversationId)
      }
      return
    }

    // 3b. Skip bot when waiting for a human attendant — but allow patient to return to menu
    // if no human has responded yet (e.g. accidental transfer or wrong selection).
    if (conversation.status === 'waiting_human') {
      const msgLower = messageText.trim().toLowerCase()
      const wantsMenu = /^(menu|inicio|início|0)$/.test(msgLower)
        || /\bmenu principal\b/.test(msgLower)
        || /\bvoltar\b/.test(msgLower)

      if (wantsMenu) {
        // Check if any human/staff has sent a message after the transfer
        const { data: humanMessages } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('sender', 'human')
          .limit(1)

        const humanHasResponded = humanMessages && humanMessages.length > 0

        if (!humanHasResponded) {
          // No human responded yet — let patient go back to menu
          await supabase
            .from('conversations')
            .update({ bot_enabled: true, bot_state: 'menu', status: 'in_progress', updated_at: new Date().toISOString() })
            .eq('id', conversationId)
          const menuResponse = {
            message: buildMenuMessage(botSettings),
            nextState: 'menu' as BotState,
            nextContext: { patientPhone: phone } as BotContext,
          }
          await sendBotResponse(conversationId, phone, menuResponse, clinicId)
          console.log('[Bot] Patient returned to menu from waiting_human (no human had responded yet):', conversationId)
          return
        }
      }

      // Notify clinic staff via push that the patient sent a new message
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

      console.log('[Bot] Conversation waiting for human attendant — bot silenced:', conversationId)
      return
    }

    // 4. Check working hours if enabled
    // bot_respond_anytime = true → skip the out-of-hours check entirely (bot works 24/7).
    // Otherwise respect working_hours_enabled + isWithinWorkingHours as before.
    const outsideHours = !botSettings.bot_respond_anytime
      && botSettings.working_hours_enabled
      && !isWithinWorkingHours(botSettings)

    if (outsideHours) {
      console.log('[Bot] Outside working hours, sending out-of-hours message')
      const nextTime = getNextWorkingTime(botSettings)
      const baseMessage = botSettings.message_out_of_hours
      const outOfHoursMessage = nextTime
        ? `${baseMessage}\n\n🕐 Retornaremos no atendimento *${nextTime}*.`
        : baseMessage
      const outOfHoursResponse = {
        message: outOfHoursMessage,
        nextState: conversation.bot_state as BotState || 'menu',
        nextContext: conversation.bot_context as BotContext || {},
      }
      await sendBotResponse(conversationId, phone, outOfHoursResponse, clinicId)
      return
    }

    // 5. Get current state and context
    const currentState = (conversation.bot_state || 'menu') as BotState
    let currentContext = (conversation.bot_context || {}) as BotContext

    // Always keep patientPhone in context so all handlers have access to it
    currentContext = {
      ...currentContext,
      patientPhone: phone,
      patientName: currentContext.patientName || undefined,
      patientCpf: currentContext.patientCpf || conversation.cpf || undefined,
    }

    // 5b. First contact: send welcome message regardless of what the patient typed.
    // This ensures the clinic's configured greeting always reaches new patients,
    // even when they start with "agendar" instead of "oi".
    if (isFirstContact && botSettings.message_welcome?.trim()) {
      const welcomeText = botSettings.message_welcome.trim()
      const welcomeResult = await sendInternalZapiMessage({
        clinicId,
        conversationId,
        phone,
        text: welcomeText,
      })
      if (!welcomeResult.success) {
        console.error('[Bot] Failed to send welcome message:', welcomeResult.error || 'Unknown error')
      } else {
        // Save to DB immediately so the fromMe webhook dedup recognises it and skips it —
        // preventing Z-API's fromMe echo from creating a duplicate blue 'human' bubble.
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender: 'bot',
          content: welcomeText,
          zapi_message_id: welcomeResult.messageId || null,
          message_type: 'text',
          delivery_status: 'sent',
          metadata: { source: 'bot_welcome' },
          created_at: new Date().toISOString(),
        })
      }
      await new Promise(r => setTimeout(r, 400))
    }

    // Pre-load appointments into context whenever the patient might need them.
    // This covers: menu intent for cancel/reschedule/view, and the ver_agendamentos state.
    // We do it ONCE here so the engine always receives real data without extra round-trips.
    if (!currentContext.appointments) {
      const intentRaw = messageText.toLowerCase()
      const stateNeedsAppointments =
        currentState === 'ver_agendamentos' ||
        (currentState === 'menu' && (
          intentRaw.includes('cancelar') || intentRaw.includes('desmarcar') ||
          intentRaw.includes('remarcar') || intentRaw.includes('reagendar') ||
          intentRaw.includes('ver') || intentRaw.includes('agendamento') ||
          /\b[2-5]\b/.test(intentRaw)
        ))

      if (stateNeedsAppointments) {
        const appointments = await getPatientAppointments(clinicId, phone, currentContext.patientCpf)
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

    // 6. Process message through bot engine with settings
    const response = await handleBotTurn(
      conversationId,
      messageText,
      currentState,
      currentContext,
      botSettings,
      phone,
      clinicId
    )

    // 7. Send bot response
    const sent = await sendBotResponse(conversationId, phone, response, clinicId)

    if (sent) {
      console.log('[Bot] Response sent successfully:', {
        conversationId,
        nextState: response.nextState,
      })
    } else {
      console.error('[Bot] Failed to send response:', conversationId)
    }
  } catch (error) {
    console.error('[Bot] Error in triggerBotResponse:', error)
    
    // Log error (non-blocking, ignore if fails)
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
