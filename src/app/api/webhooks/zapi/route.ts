import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseConnectionStatusWebhook, parseWebhookPayload, shouldProcessWebhook } from '@/lib/zapi/webhookParser'
import { handleIncomingMessage, logWebhookActivity } from '@/lib/services/inboxService'
import { handleBotTurn, sendBotResponse, type BotState, type BotContext } from '@/lib/bot/engine'
import { getPatientAppointments } from '@/lib/bot/actions'
import { getBotSettings, isWithinWorkingHours } from '@/lib/services/botSettingsService'

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
    let payload: any
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
      console.log('[Z-API Webhook] Skipping webhook (fromMe or invalid):', {
        instanceId: parsed.instanceId,
        phone: parsed.phone,
        isFromMe: parsed.isFromMe,
      })
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

    console.log('[Z-API Webhook] Processing message:', {
      instanceId: parsed.instanceId,
      clinicId,
      phone: parsed.phone,
      hasText: !!parsed.messageText,
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

    // 10. Trigger bot response if enabled (non-blocking)
    if (result.conversationId && parsed.messageText) {
      triggerBotResponse(
        result.conversationId,
        parsed.phone,
        parsed.normalizedText || parsed.messageText,
        clinicId
      ).catch((error) => {
        console.error('[Z-API Webhook] Bot response failed:', error)
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
  clinicId: string
): Promise<void> {
  const supabase = createAdminClient()

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
      .select('bot_enabled, bot_state, bot_context, status')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      console.log('[Bot] Conversation not found:', conversationId)
      return
    }

    // 3. Check if bot is enabled
    if (!conversation.bot_enabled) {
      console.log('[Bot] Bot disabled for conversation:', conversationId)
      return
    }

    // 4. Check working hours if enabled
    if (botSettings.working_hours_enabled && !isWithinWorkingHours(botSettings)) {
      console.log('[Bot] Outside working hours, sending out-of-hours message')
      
      // Send out-of-hours message but don't advance state
      const outOfHoursResponse = {
        message: botSettings.message_out_of_hours,
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
    currentContext = { ...currentContext, patientPhone: phone }

    // Pre-fetch appointments when entering ver_agendamentos so the handler
    // receives real data on the very first turn of that state.
    if (currentState === 'ver_agendamentos' && !currentContext.appointments) {
      const appointments = await getPatientAppointments(clinicId, phone)
      if (appointments.length === 0) {
        // Send "not found" immediately and reset to menu
        await sendBotResponse(
          conversationId,
          phone,
          {
            message: (await import('@/lib/bot/templates')).templates.viewAppointmentsNotFound,
            nextState: 'menu',
            nextContext: {},
          },
          clinicId
        )
        return
      }
      currentContext = { ...currentContext, appointments }
      // Show the list right away before processing this message as a choice
      await sendBotResponse(
        conversationId,
        phone,
        {
          message: (await import('@/lib/bot/templates')).templates.viewAppointments(appointments),
          nextState: 'ver_agendamentos',
          nextContext: currentContext,
        },
        clinicId
      )
      return
    }

    // Pre-load appointments into context for cancel/reschedule flows so the
    // engine can present the right selection screen when > 1 appointment exists.
    if (
      currentState === 'menu' &&
      !currentContext.appointments
    ) {
      const intent = messageText.toLowerCase()
      const needsAppointments =
        intent.includes('cancelar') || intent.includes('desmarcar') ||
        intent.includes('remarcar') || intent.includes('reagendar') ||
        /\b[23]\b/.test(intent)

      if (needsAppointments) {
        const appointments = await getPatientAppointments(clinicId, phone)
        if (appointments.length > 1) {
          // Determine flow from intent
          const isCancel = intent.includes('cancelar') || intent.includes('desmarcar') || /\b3\b/.test(intent)
          const { templates } = await import('@/lib/bot/templates')
          const msg = isCancel
            ? templates.whichAppointmentCancel(appointments)
            : templates.whichAppointmentReschedule(appointments)
          const nextState: BotState = isCancel ? 'cancelar_qual' : 'reagendar_qual'
          await sendBotResponse(
            conversationId,
            phone,
            { message: msg, nextState, nextContext: { ...currentContext, appointments } },
            clinicId
          )
          return
        }
        // Exactly 1 — put it in context so cancel/reschedule handlers can use it
        if (appointments.length === 1) {
          currentContext = { ...currentContext, appointmentId: appointments[0].id, appointments }
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
