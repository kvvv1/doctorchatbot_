import type {
  ConversationReconciliationState,
  Message,
  MessageDeliveryStatus,
  MessageDirection,
  MessageExternalStatus,
  MessageOrigin,
  MessageSender,
} from '@/lib/types/database'

type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any
}

type PersistCanonicalMessageParams = {
  supabase: SupabaseLike
  clinicId?: string | null
  conversationId: string
  sender: MessageSender
  direction: MessageDirection
  origin: MessageOrigin
  content: string
  zapiMessageId?: string | null
  clientMessageId?: string | null
  externalStatus?: MessageExternalStatus
  deliveryStatus?: MessageDeliveryStatus
  failedReason?: string | null
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  webhookSeen?: boolean
  sentByMeSeen?: boolean
  conversationStatus?: string
  botEnabled?: boolean
  unreadIncrement?: boolean
}

type PersistCanonicalMessageResult = {
  message: Message
  created: boolean
  dedupRule: 'zapi_message_id' | 'client_message_id' | 'content_window' | 'none'
}

const CONTENT_WINDOW_MS = 45_000

const EXTERNAL_STATUS_PRIORITY: Record<MessageExternalStatus, number> = {
  unknown: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  received: 5,
  failed: 6,
}

export function resolveDeliveryStatusFromExternalStatus(
  externalStatus: MessageExternalStatus,
  sender: MessageSender,
): MessageDeliveryStatus {
  if (sender === 'patient') return 'received'
  switch (externalStatus) {
    case 'pending':
      return 'sending'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
      return 'failed'
    case 'received':
      return 'received'
    default:
      return 'sent'
  }
}

export function mergeExternalStatus(
  currentStatus: MessageExternalStatus | null | undefined,
  nextStatus: MessageExternalStatus,
): MessageExternalStatus {
  const current = currentStatus ?? 'unknown'
  return EXTERNAL_STATUS_PRIORITY[nextStatus] >= EXTERNAL_STATUS_PRIORITY[current]
    ? nextStatus
    : current
}

export function resolveReconciliationState(params: {
  pendingOldCount: number
  remoteLastMessageAt?: string | null
  localLastMessageAt?: string | null
}): ConversationReconciliationState {
  if (params.pendingOldCount > 0) return 'degraded'

  if (!params.remoteLastMessageAt || !params.localLastMessageAt) {
    return 'healthy'
  }

  const remote = new Date(params.remoteLastMessageAt).getTime()
  const local = new Date(params.localLastMessageAt).getTime()

  if (Number.isFinite(remote) && Number.isFinite(local) && Math.abs(remote - local) > 120000) {
    return 'needs_reconcile'
  }

  return 'healthy'
}

export async function persistCanonicalMessage(
  params: PersistCanonicalMessageParams,
): Promise<PersistCanonicalMessageResult> {
  const now = new Date().toISOString()
  const createdAt = params.createdAt ?? now
  const updatedAt = params.updatedAt ?? now
  const nextExternalStatus = params.externalStatus ?? inferExternalStatus(params.sender, params.deliveryStatus)
  const nextDeliveryStatus =
    params.deliveryStatus ?? resolveDeliveryStatusFromExternalStatus(nextExternalStatus, params.sender)

  const existing = await findExistingCanonicalMessage(params)
  const metadata = normalizeMetadata(params.metadata)

  if (existing) {
    const mergedExternalStatus = mergeExternalStatus(existing.external_status, nextExternalStatus)
    const deliveryStatus =
      mergedExternalStatus === existing.external_status && existing.delivery_status
        ? existing.delivery_status
        : resolveDeliveryStatusFromExternalStatus(mergedExternalStatus, params.sender)

    const updatePayload = {
      zapi_message_id: existing.zapi_message_id || params.zapiMessageId || null,
      client_message_id: existing.client_message_id || params.clientMessageId || null,
      direction: params.direction,
      origin: preferOrigin(existing.origin, params.origin),
      external_status: mergedExternalStatus,
      delivery_status: deliveryStatus,
      failed_reason: params.failedReason ?? existing.failed_reason ?? null,
      metadata: {
        ...normalizeMetadata(existing.metadata),
        ...metadata,
      },
      reconciled_at: now,
      webhook_seen: Boolean(existing.webhook_seen || params.webhookSeen),
      sent_by_me_seen: Boolean(existing.sent_by_me_seen || params.sentByMeSeen),
      updated_at: updatedAt,
    }

    const { data: updated, error: updateError } = await params.supabase
      .from('messages')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      throw updateError ?? new Error('Failed to update canonical message')
    }

    const shouldTouchConversation =
      existing._dedupRule !== 'zapi_message_id' ||
      (!existing.webhook_seen && Boolean(params.webhookSeen)) ||
      (!existing.sent_by_me_seen && Boolean(params.sentByMeSeen)) ||
      mergedExternalStatus !== existing.external_status

    if (shouldTouchConversation) {
      await touchConversationAfterMessage({
        ...params,
        externalStatus: mergedExternalStatus,
        deliveryStatus,
        createdAt,
        updatedAt,
      })
    }

    console.info('[MessageReconciliation] Updated canonical message', {
      conversationId: params.conversationId,
      messageId: updated.id,
      zapiMessageId: updatePayload.zapi_message_id,
      clientMessageId: updatePayload.client_message_id,
      dedupRule: existing._dedupRule,
      externalStatus: mergedExternalStatus,
      sender: params.sender,
      origin: params.origin,
    })

    return {
      message: updated as Message,
      created: false,
      dedupRule: existing._dedupRule,
    }
  }

  const insertPayload = {
    conversation_id: params.conversationId,
    sender: params.sender,
    content: params.content,
    zapi_message_id: params.zapiMessageId || null,
    client_message_id: params.clientMessageId || null,
    message_type: 'text',
    delivery_status: nextDeliveryStatus,
    direction: params.direction,
    origin: params.origin,
    external_status: nextExternalStatus,
    reconciled_at: now,
    webhook_seen: Boolean(params.webhookSeen),
    sent_by_me_seen: Boolean(params.sentByMeSeen),
    failed_reason: params.failedReason ?? null,
    metadata,
    created_at: createdAt,
    updated_at: updatedAt,
  }

  const { data: inserted, error: insertError } = await params.supabase
    .from('messages')
    .insert(insertPayload)
    .select('*')
    .single()

  if (insertError || !inserted) {
    throw insertError ?? new Error('Failed to insert canonical message')
  }

  await touchConversationAfterMessage({
    ...params,
    externalStatus: nextExternalStatus,
    deliveryStatus: nextDeliveryStatus,
    createdAt,
    updatedAt,
  })

  console.info('[MessageReconciliation] Inserted canonical message', {
    conversationId: params.conversationId,
    messageId: inserted.id,
    zapiMessageId: insertPayload.zapi_message_id,
    clientMessageId: insertPayload.client_message_id,
    externalStatus: nextExternalStatus,
    sender: params.sender,
    origin: params.origin,
  })

  return {
    message: inserted as Message,
    created: true,
    dedupRule: 'none',
  }
}

async function findExistingCanonicalMessage(
  params: PersistCanonicalMessageParams,
): Promise<(Message & { _dedupRule: 'zapi_message_id' | 'client_message_id' | 'content_window' }) | null> {
  if (params.zapiMessageId) {
    const { data } = await params.supabase
      .from('messages')
      .select('*')
      .eq('zapi_message_id', params.zapiMessageId)
      .limit(1)
      .maybeSingle()

    if (data) {
      return { ...(data as Message), _dedupRule: 'zapi_message_id' }
    }
  }

  if (params.clientMessageId) {
    const { data } = await params.supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', params.conversationId)
      .eq('client_message_id', params.clientMessageId)
      .limit(1)
      .maybeSingle()

    if (data) {
      return { ...(data as Message), _dedupRule: 'client_message_id' }
    }
  }

  const content = params.content.trim()
  if (!content) return null

  const cutoff = new Date(new Date(params.createdAt ?? new Date().toISOString()).getTime() - CONTENT_WINDOW_MS).toISOString()
  const { data } = await params.supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .eq('sender', params.sender)
    .eq('direction', params.direction)
    .eq('content', content)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) {
    return { ...(data as Message), _dedupRule: 'content_window' }
  }

  return null
}

async function touchConversationAfterMessage(
  params: Omit<PersistCanonicalMessageParams, 'supabase'> & {
    supabase: SupabaseLike
    externalStatus: MessageExternalStatus
    deliveryStatus: MessageDeliveryStatus
    createdAt: string
    updatedAt: string
  },
) {
  const preview = params.content.length > 100 ? `${params.content.slice(0, 100)}...` : params.content
  const now = new Date().toISOString()

  const conversationPatch: Record<string, unknown> = {
    last_message_at: params.createdAt,
    last_message_preview: preview,
    last_external_message_at:
      params.externalStatus !== 'pending' ? params.createdAt : undefined,
    last_reconciled_at: now,
    reconciliation_state: 'healthy',
    updated_at: params.updatedAt,
  }

  if (params.sender === 'patient') {
    conversationPatch.last_patient_message_at = params.createdAt
  }

  if (params.conversationStatus) {
    conversationPatch.status = params.conversationStatus
  }

  if (typeof params.botEnabled === 'boolean') {
    conversationPatch.bot_enabled = params.botEnabled
  }

  await params.supabase
    .from('conversations')
    .update(stripUndefined(conversationPatch))
    .eq('id', params.conversationId)

  if (params.unreadIncrement) {
    await params.supabase.rpc('increment_conversation_unread', {
      target_conversation_id: params.conversationId,
    })
  }
}

function inferExternalStatus(
  sender: MessageSender,
  deliveryStatus?: MessageDeliveryStatus,
): MessageExternalStatus {
  if (sender === 'patient') return 'received'
  switch (deliveryStatus) {
    case 'queued':
    case 'sending':
      return 'pending'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
      return 'failed'
    case 'received':
      return 'received'
    case 'sent':
      return 'sent'
    default:
      return 'unknown'
  }
}

function preferOrigin(
  currentOrigin: MessageOrigin | null | undefined,
  nextOrigin: MessageOrigin,
): MessageOrigin {
  if (!currentOrigin) return nextOrigin
  if (currentOrigin === 'dashboard_manual' && nextOrigin === 'whatsapp_app') return currentOrigin
  if (currentOrigin === 'bot' && nextOrigin === 'webhook_reconciled') return currentOrigin
  return nextOrigin
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}
