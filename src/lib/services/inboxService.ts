/**
 * Inbox Service
 * 
 * Handles incoming messages from external sources (webhooks)
 * and persists them to the database.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Conversation } from '@/lib/types/database'
import { getBotSettings } from './botSettingsService'
import { createNotification } from './notificationService'
import { zapiGetProfilePicture } from '@/lib/zapi/client'
import { persistCanonicalMessage } from './messageReconciliationService'
import {
  getBrazilianPhoneLookupCandidates,
  normalizePhoneForStorage,
} from '@/lib/utils/phone'

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
  const normalizedPhone = normalizePhoneForStorage(data.phone)

  try {
    if (!normalizedPhone) {
      return {
        success: false,
        createdConversation: false,
        error: 'Invalid phone number',
      }
    }

    // 1. Find or create conversation
    const { conversation, created } = await findOrCreateConversation(
      supabase,
      data.clinicId,
      normalizedPhone
    )

    if (!conversation) {
      return {
        success: false,
        createdConversation: false,
        error: 'Failed to find or create conversation',
      }
    }

    // 2. Insert or reconcile message canonically
    const persisted = await persistCanonicalMessage({
      supabase,
      clinicId: data.clinicId,
      conversationId: conversation.id,
      sender: 'patient',
      direction: 'inbound',
      origin: 'webhook_reconciled',
      content: data.text || '[Mensagem sem texto]',
      zapiMessageId: data.zapiMessageId || null,
      externalStatus: 'received',
      deliveryStatus: 'received',
      metadata: {
        source: 'zapi_webhook',
        timestamp: data.timestamp?.toISOString() ?? null,
      },
      createdAt: data.timestamp?.toISOString(),
      webhookSeen: true,
      unreadIncrement: true,
    })

    if (!persisted.created) {
      console.log('[InboxService] Duplicate message detected, skipping bot trigger:', {
        zapiMessageId: data.zapiMessageId,
        dedupRule: persisted.dedupRule,
      })
      return {
        success: true,
        messageId: persisted.message.id,
        conversationId: undefined,
        createdConversation: false,
      }
    }

    // 3. Update conversation metadata
    const messagePreview = truncateText(data.text, 80)
    const now = new Date().toISOString()

    await updateConversationMetadata(supabase, conversation.id, {
      lastMessageAt: data.timestamp?.toISOString() ?? now,
      lastMessagePreview: messagePreview,
      lastPatientMessageAt: data.timestamp?.toISOString() ?? now,
      lastExternalMessageAt: data.timestamp?.toISOString() ?? now,
      lastReconciledAt: now,
      reconciliationState: 'healthy',
      status: conversation.status,
    })

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
      messageId: persisted.message.id,
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
 * Saves a message sent by the secretary from their own WhatsApp phone (fromMe=true).
 * Only persists the message to an existing conversation — never creates a new one
 * and never triggers the bot.
 */
export async function saveFromMeMessage(data: {
  supabase: ReturnType<typeof createAdminClient>
  clinicId: string
  phone: string
  text: string
  zapiMessageId?: string | null
  timestamp?: number | null
}): Promise<void> {
  const { supabase, clinicId, text, zapiMessageId, timestamp } = data
  try {
    const normalizedPhone = normalizePhoneForStorage(data.phone)
    if (!normalizedPhone) return

    // Skip empty messages — Z-API fires fromMe webhooks for interactive button/list
    // messages where the body text is empty (the content is in the button structure).
    // These are not real secretary messages and should be silently ignored.
    const cleanText = (text || '').trim()
    if (!cleanText || cleanText === '[Mensagem sem texto]') return

    // Find the existing conversation (do NOT create one)
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('clinic_id', clinicId)
      .in('patient_phone', getBrazilianPhoneLookupCandidates(normalizedPhone))
      .limit(1)
      .maybeSingle()

    if (!conversation) return // No conversation yet — silently skip

    const messageTimestamp = timestamp
      ? new Date(timestamp * 1000).toISOString()
      : new Date().toISOString()

    const preview = cleanText.substring(0, 80)

    await persistCanonicalMessage({
      supabase,
      clinicId,
      conversationId: conversation.id,
      sender: 'human',
      direction: 'outbound',
      origin: 'whatsapp_app',
      content: cleanText,
      zapiMessageId: zapiMessageId || null,
      externalStatus: 'sent',
      deliveryStatus: 'sent',
      metadata: { source: 'zapi_from_me' },
      createdAt: messageTimestamp,
      updatedAt: messageTimestamp,
      webhookSeen: true,
      sentByMeSeen: true,
      conversationStatus: 'in_progress',
      botEnabled: false,
    })

    await supabase.from('conversations').update({
      last_message_at: messageTimestamp,
      last_message_preview: preview,
      last_external_message_at: messageTimestamp,
      last_reconciled_at: new Date().toISOString(),
      reconciliation_state: 'healthy',
      bot_enabled: false,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id)
  } catch (err) {
    console.error('[InboxService] Error saving fromMe message:', err)
  }
}

/**
 * Finds an existing conversation or creates a new one.
 */
async function findOrCreateConversation(
  supabase: ReturnType<typeof createAdminClient>,
  clinicId: string,
  phone: string
): Promise<{ conversation: Conversation | null; created: boolean }> {
  const phoneCandidates = getBrazilianPhoneLookupCandidates(phone)

  // Try to find existing conversation — use limit(1) + maybeSingle to avoid
  // crashing when multiple rows exist (which would cause .single() to error and
  // create yet another duplicate conversation).
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('*')
    .eq('clinic_id', clinicId)
    .in('patient_phone', phoneCandidates)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && !findError) {
    return { conversation: existing as Conversation, created: false }
  }

  // Get bot settings to determine default bot enabled state
  const botSettings = await getBotSettings(clinicId)
  const botEnabled = botSettings?.bot_default_enabled ?? true

  // Create new conversation
  const newConversation = {
    clinic_id: clinicId,
    patient_phone: phone,
    patient_name: null,
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
    // Could be a unique constraint violation from a race condition — re-fetch the winner row.
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('patient_phone', phoneCandidates)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return { conversation: existing as Conversation, created: false }
    }

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
 * Updates conversation metadata after receiving a new message.
 */
async function updateConversationMetadata(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  data: {
    lastMessageAt: string
    lastMessagePreview: string
    lastPatientMessageAt: string
    lastExternalMessageAt?: string
    lastReconciledAt?: string
    reconciliationState?: 'healthy' | 'needs_reconcile' | 'degraded'
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
      last_external_message_at: data.lastExternalMessageAt ?? data.lastMessageAt,
      last_reconciled_at: data.lastReconciledAt ?? new Date().toISOString(),
      reconciliation_state: data.reconciliationState ?? 'healthy',
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
  details: Record<string, unknown>
  phone?: string | null
  conversationId?: string | null
}) {
  try {
    const supabase = createAdminClient()
    const normalizedPhone = normalizePhoneForStorage(data.phone)
    
    await supabase.from('logs').insert({
      level: data.level,
      action: data.action,
      details: {
        ...data.details,
        conversationId: data.conversationId || data.details.conversationId || null,
        normalizedPhone,
      },
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    // Silently fail - logging is not critical
    console.log('[InboxService] Failed to log activity (non-critical):', error)
  }
}
