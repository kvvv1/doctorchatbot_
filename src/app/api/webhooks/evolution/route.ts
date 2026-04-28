import { NextRequest, NextResponse } from 'next/server'
import {
  parseConnectionStatusWebhook,
  parseWebhookPayload,
} from '@/lib/evolution/webhookParser'
import {
  handleConnectionStatusWebhook,
  handleMessageWebhook,
  handleDeliveryStatusUpdates,
  handleSendMessageConfirmation,
} from '@/app/api/webhooks/_shared/webhookCore'

/**
 * POST /api/webhooks/evolution
 *
 * Receives incoming WhatsApp messages from Evolution API webhook.
 *
 * Security:
 * - Evolution sends `apikey` inside the JSON body; the parser extracts it as
 *   `token` and the shared core validates it against `whatsapp_instances.client_token`.
 *
 * Configure the webhook in Evolution:
 *   POST https://api.codexy.com.br/webhook/set/{instance}
 *   { "url": "https://app.doctorchatbot.com.br/api/webhooks/evolution", "enabled": true }
 */
export async function POST(request: NextRequest) {
  try {
    let payload: unknown
    try {
      payload = await request.json()
    } catch (error) {
      console.error('[Evolution Webhook] Invalid JSON payload:', error)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const event = (payload as { event?: string }).event

    // Connection status event
    if (event?.startsWith('connection.')) {
      const parsedStatus = parseConnectionStatusWebhook(payload)
      if (parsedStatus) return handleConnectionStatusWebhook(parsedStatus)
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Delivery status updates (messages.update)
    if (event === 'messages.update') {
      return handleDeliveryStatusUpdates(payload)
    }

    // Send confirmation (send.message)
    if (event === 'send.message') {
      return handleSendMessageConfirmation(payload)
    }

    // Message event (messages.upsert)
    let parsed
    try {
      parsed = parseWebhookPayload(payload)
    } catch (error) {
      console.error('[Evolution Webhook] Failed to parse payload:', error)
      return NextResponse.json(
        {
          error: 'Invalid webhook payload',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 400 },
      )
    }

    return handleMessageWebhook(parsed, payload)
  } catch (error) {
    console.error('[Evolution Webhook] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
