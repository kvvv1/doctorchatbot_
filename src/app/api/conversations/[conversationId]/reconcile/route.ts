import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrazilianPhoneLookupCandidates } from '@/lib/utils/phone'
import {
  resolveReconciliationState,
} from '@/lib/services/messageReconciliationService'
import { zapiGetChats, validateCredentials } from '@/lib/zapi/client'

type PendingMessageRow = {
  id: string
  sender: string | null
  webhook_seen: boolean | null
  sent_by_me_seen: boolean | null
  created_at: string
}

type RelatedConversationRow = {
  id: string
  last_message_at: string | null
}

function findChatForConversation(chats: Awaited<ReturnType<typeof zapiGetChats>>, phone: string) {
  const candidates = new Set(getBrazilianPhoneLookupCandidates(phone))
  return chats.find((chat) => chat.phone && candidates.has(chat.phone))
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.clinic_id) {
      return NextResponse.json({ ok: false, error: 'Clínica não encontrada' }, { status: 404 })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, clinic_id, patient_phone, last_message_at, reconciliation_state')
      .eq('id', conversationId)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (conversationError || !conversation) {
      return NextResponse.json({ ok: false, error: 'Conversa não encontrada' }, { status: 404 })
    }

    const phoneCandidates = getBrazilianPhoneLookupCandidates(conversation.patient_phone)
    const { data: relatedConversations } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .eq('clinic_id', profile.clinic_id)
      .in('patient_phone', phoneCandidates)

    const scopedConversations = (relatedConversations || []) as RelatedConversationRow[]

    const relatedConversationIds =
      scopedConversations
        .map((item: RelatedConversationRow) => item.id)
        .filter((id): id is string => Boolean(id))

    const localLastMessageAt =
      scopedConversations
        .map((item: RelatedConversationRow) => item.last_message_at)
        .filter((value): value is string => Boolean(value))
        .sort((left: string, right: string) => new Date(right).getTime() - new Date(left).getTime())[0] ?? conversation.last_message_at

    const { data: pendingMessages } = await supabase
      .from('messages')
      .select('id, sender, webhook_seen, sent_by_me_seen, created_at')
      .in('conversation_id', relatedConversationIds.length > 0 ? relatedConversationIds : [conversationId])
      .in('external_status', ['pending', 'unknown'])
      .lte('created_at', new Date(Date.now() - 600000).toISOString())

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('instance_id, token, client_token')
      .eq('clinic_id', profile.clinic_id)
      .eq('provider', 'zapi')
      .single()

    if (instanceError || !instance) {
      return NextResponse.json({ ok: false, error: 'Instância WhatsApp não configurada' }, { status: 404 })
    }

    const credentials = {
      instanceId: instance.instance_id,
      token: instance.token,
      clientToken: instance.client_token || undefined,
    }

    if (!validateCredentials(credentials)) {
      return NextResponse.json({ ok: false, error: 'Credenciais Z-API inválidas' }, { status: 400 })
    }

    const actionablePendingMessages =
      ((pendingMessages || []) as PendingMessageRow[]).filter((message) => {
        const isOutbound = message.sender !== 'patient'
        const seenByWebhook = Boolean(message.webhook_seen || message.sent_by_me_seen)
        return isOutbound && !seenByWebhook
      })

    const chats = await zapiGetChats(credentials)
    const matchedChat = findChatForConversation(chats, conversation.patient_phone)
    const remoteLastMessageAt = matchedChat?.lastMessageTime ?? null
    const reconciliationState = resolveReconciliationState({
      pendingOldCount: actionablePendingMessages.length,
      remoteLastMessageAt,
      localLastMessageAt,
    })

    const now = new Date().toISOString()

    const conversationPatch: Record<string, unknown> = {
      last_reconciled_at: now,
      reconciliation_state: reconciliationState,
      updated_at: now,
    }

    if (remoteLastMessageAt) {
      conversationPatch.last_external_message_at = remoteLastMessageAt
    }

    await supabase
      .from('conversations')
      .update(conversationPatch)
      .in('id', relatedConversationIds.length > 0 ? relatedConversationIds : [conversationId])

    console.info('[Conversation Reconcile] Completed', {
      conversationId,
      scopedConversationIds: relatedConversationIds,
      pendingOldCount: actionablePendingMessages.length,
      remoteLastMessageAt,
      localLastMessageAt,
      reconciliationState,
      chatFound: Boolean(matchedChat),
    })

    return NextResponse.json({
      ok: true,
      reconciliationState,
      remoteLastMessageAt,
      localLastMessageAt,
      pendingOldCount: actionablePendingMessages.length,
      chatFound: Boolean(matchedChat),
    })
  } catch (error) {
    console.error('[Conversation Reconcile] Failed:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Falha ao reconciliar conversa' },
      { status: 500 },
    )
  }
}
