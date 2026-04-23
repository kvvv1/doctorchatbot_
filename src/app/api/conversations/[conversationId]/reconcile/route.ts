import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrazilianPhoneLookupCandidates } from '@/lib/utils/phone'
import {
  resolveReconciliationState,
} from '@/lib/services/messageReconciliationService'
import { zapiGetChats, validateCredentials } from '@/lib/zapi/client'

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

    const { data: pendingMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .in('external_status', ['pending', 'unknown'])
      .lte('created_at', new Date(Date.now() - 120000).toISOString())

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

    const chats = await zapiGetChats(credentials)
    const matchedChat = findChatForConversation(chats, conversation.patient_phone)
    const remoteLastMessageAt = matchedChat?.lastMessageTime ?? null
    const reconciliationState = resolveReconciliationState({
      pendingOldCount: pendingMessages?.length ?? 0,
      remoteLastMessageAt,
      localLastMessageAt: conversation.last_message_at,
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
      .eq('id', conversationId)

    return NextResponse.json({
      ok: true,
      reconciliationState,
      remoteLastMessageAt,
      localLastMessageAt: conversation.last_message_at,
      pendingOldCount: pendingMessages?.length ?? 0,
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
