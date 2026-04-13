/**
 * GET /api/local/messages/[conversationId]
 *
 * Serve mensagens a partir do SQLite local para os hooks do browser
 * quando NEXT_PUBLIC_LOCAL_DB=sqlite.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLocalClient } from '@/lib/db/local-client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }

    const client = createLocalClient()
    const { data, error } = await client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      const errorMessage =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: unknown }).message ?? 'Erro ao buscar mensagens locais')
          : 'Erro ao buscar mensagens locais'

      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
