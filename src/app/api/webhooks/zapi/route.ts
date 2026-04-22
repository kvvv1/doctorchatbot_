import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseConnectionStatusWebhook, parseWebhookPayload, shouldProcessWebhook } from '@/lib/zapi/webhookParser'
import { handleIncomingMessage, saveFromMeMessage, logWebhookActivity } from '@/lib/services/inboxService'
import { handleBotTurn, sendBotResponse, buildMenuMessage, type BotState, type BotContext } from '@/lib/bot/engine'
import { getPatientAppointments } from '@/lib/bot/actions'
import { getBotSettings, isWithinWorkingHours, getNextWorkingTime } from '@/lib/services/botSettingsService'
import { sendInternalZapiMessage } from '@/lib/zapi/internalSend'
import { sendPushToClinicUsers } from '@/lib/services/pushService'

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

        await triggerBotResponse(
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

  // Debounce guard: if a newer patient message arrived after this one was
  // enqueued, abort — the newer message's triggerBotResponse will respond instead.
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
      // Do NOT reactivate bot while a human attendant is actively attending
      if (conversation.status === 'waiting_human') {
        console.log('[Bot] Human attendance active — bot stays silent, ignoring reactivation attempt:', conversationId)
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
          .eq('sender', 'staff')
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
      patientName: currentContext.patientName || conversation.patient_name || undefined,
      patientCpf: currentContext.patientCpf || conversation.cpf || undefined,
    }

    // 5b. First contact: send welcome message regardless of what the patient typed.
    // This ensures the clinic's configured greeting always reaches new patients,
    // even when they start with "agendar" instead of "oi".
    if (isFirstContact && botSettings.message_welcome?.trim()) {
      const welcomeResult = await sendInternalZapiMessage({
        clinicId,
        conversationId,
        phone,
        text: botSettings.message_welcome.trim(),
      })
      if (!welcomeResult.success) {
        console.error('[Bot] Failed to send welcome message:', welcomeResult.error || 'Unknown error')
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
