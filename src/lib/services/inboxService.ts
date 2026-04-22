/**
 * Inbox Service
 * 
 * Handles incoming messages from external sources (webhooks)
 * and persists them to the database.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Conversation, Message } from '@/lib/types/database'
import { getBotSettings } from './botSettingsService'
import { createNotification } from './notificationService'
import { zapiGetProfilePicture } from '@/lib/zapi/client'

export interface IncomingMessageData {
  clinicId: string
  phone: string
  name: string | null
  text: string
  zapiMessageId?: string | null
  timestamp?: Date
}

export interface ProcessResult {
  success: boolean
  conversationId?: string
  messageId?: string
  createdConversation: boolean
  error?: string
}

/**
 * Processes an incoming message from a patient.
 * 
 * Steps:
 * 1. Find or create conversation
 * 2. Insert message
 * 3. Update conversation metadata
 * 
 * @param data - The incoming message data
 * @returns Result of the operation
 */
export async function handleIncomingMessage(
  data: IncomingMessageData
): Promise<ProcessResult> {
  const supabase = createAdminClient()

  try {
    // 0. Check for duplicate message (deduplication)
    if (data.zapiMessageId) {
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('id')
        .eq('zapi_message_id', data.zapiMessageId)
        .single()

      if (existingMessage) {
        console.log('[InboxService] Duplicate message detected, skipping:', data.zapiMessageId)
        // Still look up the conversationId so the webhook route skips triggerBotResponse
        // (conversationId undefined → triggerBotResponse not called).
        return {
          success: true,
          messageId: existingMessage.id,
          conversationId: undefined,
          createdConversation: false,
        }
      }
    }

    // 1. Find or create conversation
    const { conversation, created } = await findOrCreateConversation(
      supabase,
      data.clinicId,
      data.phone,
      data.name
    )

    if (!conversation) {
      return {
        success: false,
        createdConversation: false,
        error: 'Failed to find or create conversation',
      }
    }

    // 2. Insert message
    const message = await insertMessage(supabase, {
      conversationId: conversation.id,
      sender: 'patient',
      content: data.text || '[Mensagem sem texto]',
      zapiMessageId: data.zapiMessageId || null,
      deliveryStatus: 'received',
      metadata: {
        source: 'zapi_webhook',
        timestamp: data.timestamp?.toISOString() ?? null,
      },
    })

    if (!message) {
      return {
        success: false,
        conversationId: conversation.id,
        createdConversation: created,
        error: 'Failed to insert message',
      }
    }

    // 3. Update conversation metadata
    const messagePreview = truncateText(data.text, 80)
    const now = new Date().toISOString()

    await Promise.all([
      updateConversationMetadata(supabase, conversation.id, {
        lastMessageAt: now,
        lastMessagePreview: messagePreview,
        lastPatientMessageAt: now,
        status: conversation.status,
      }),
      supabase.rpc('increment_conversation_unread', {
        target_conversation_id: conversation.id,
      }),
    ])

    const patientLabel = conversation.patient_name || data.name || data.phone
    await createNotification(
      data.clinicId,
      created ? 'new_conversation' : 'conversation_waiting',
      created ? `Nova conversa de ${patientLabel}` : `Nova mensagem de ${patientLabel}`,
      truncateText(data.text || '[Mensagem sem texto]', 140),
      {
        link: `/dashboard/conversas?id=${conversation.id}`,
        conversationId: conversation.id,
      },
    )

    // Fetch profile picture asynchronously when a new conversation is created (non-blocking)
    if (created) {
      fetchAndSaveProfilePicture(supabase, conversation.id, data.clinicId, data.phone).catch(() => {})
    }

    return {
      success: true,
      conversationId: conversation.id,
      messageId: message.id,
      createdConversation: created,
    }
  } catch (error) {
    console.error('[InboxService] Error handling incoming message:', error)
    return {
      success: false,
      createdConversation: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Finds an existing conversation or creates a new one.
 */
async function findOrCreateConversation(
  supabase: ReturnType<typeof createAdminClient>,
  clinicId: string,
  phone: string,
  name: string | null
): Promise<{ conversation: Conversation | null; created: boolean }> {
  // Try to find existing conversation — use limit(1) + maybeSingle to avoid
  // crashing when multiple rows exist (which would cause .single() to error and
  // create yet another duplicate conversation).
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_phone', phone)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && !findError) {
    // Update name if provided and different
    if (name && name !== existing.patient_name) {
      await supabase
        .from('conversations')
        .update({ patient_name: name, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      
      existing.patient_name = name
    }

    return { conversation: existing as Conversation, created: false }
  }

  // Get bot settings to determine default bot enabled state
  const botSettings = await getBotSettings(clinicId)
  const botEnabled = botSettings?.bot_default_enabled ?? true

  // Create new conversation
  const newConversation = {
    clinic_id: clinicId,
    patient_phone: phone,
    patient_name: name,
    status: 'new' as const,
    bot_enabled: botEnabled,
    bot_state: 'menu',
    bot_context: {},
    last_message_at: null,
    last_message_preview: null,
    last_patient_message_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert(newConversation)
    .select()
    .single()

  if (createError) {
    console.error('[InboxService] Error creating conversation:', createError)
    return { conversation: null, created: false }
  }

  return { conversation: created as Conversation, created: true }
}

/**
 * Fetches the WhatsApp profile picture for a phone number and saves it to the conversation.
 * Runs asynchronously and non-blocking — failures are silently ignored.
 */
async function fetchAndSaveProfilePicture(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  clinicId: string,
  phone: string,
) {
  try {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_id, token, client_token')
      .eq('clinic_id', clinicId)
      .eq('provider', 'zapi')
      .single()

    if (!instance?.instance_id || !instance?.token) return

    const credentials = {
      instanceId: instance.instance_id,
      token: instance.token,
      clientToken: instance.client_token || undefined,
    }

    const pictureUrl = await zapiGetProfilePicture(credentials, phone)
    if (!pictureUrl) return

    await supabase
      .from('conversations')
      .update({ profile_picture_url: pictureUrl, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  } catch {
    // Silently ignore — profile picture is non-critical
  }
}

/**
 * Inserts a new message into the database.
 */
async function insertMessage(
  supabase: ReturnType<typeof createAdminClient>,
  data: {
    conversationId: string
    sender: 'patient' | 'human' | 'bot'
    content: string
    zapiMessageId?: string | null
    deliveryStatus?: 'queued' | 'sending' | 'sent' | 'received' | 'failed'
    metadata?: Record<string, unknown>
  }
): Promise<Message | null> {
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: data.conversationId,
      sender: data.sender,
      content: data.content,
      zapi_message_id: data.zapiMessageId || null,
      message_type: 'text',
      delivery_status: data.deliveryStatus || (data.sender === 'patient' ? 'received' : 'sent'),
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[InboxService] Error inserting message:', error)
    return null
  }

  return message as Message
}

/**
 * Updates conversation metadata after receiving a new message.
 */
async function updateConversationMetadata(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  data: {
    lastMessageAt: string
    lastMessagePreview: string
    lastPatientMessageAt: string
    status: string
  }
) {
  // If conversation was done or canceled, reactivate it
  let newStatus = data.status
  if (newStatus === 'done' || newStatus === 'canceled') {
    newStatus = 'new'
  }

  const { error } = await supabase
    .from('conversations')
    .update({
      last_message_at: data.lastMessageAt,
      last_message_preview: data.lastMessagePreview,
      last_patient_message_at: data.lastPatientMessageAt,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  if (error) {
    console.error('[InboxService] Error updating conversation metadata:', error)
  }
}

/**
 * Truncates text to a maximum length.
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  
  if (text.length <= maxLength) {
    return text
  }

  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Logs webhook activity to the database (if logs table exists).
 * This is optional and non-blocking.
 */
export async function logWebhookActivity(data: {
  level: 'info' | 'warn' | 'error'
  action: string
  details: Record<string, any>
}) {
  try {
    const supabase = createAdminClient()
    
    await supabase.from('logs').insert({
      level: data.level,
      action: data.action,
      details: data.details,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    // Silently fail - logging is not critical
    console.log('[InboxService] Failed to log activity (non-critical):', error)
  }
}
