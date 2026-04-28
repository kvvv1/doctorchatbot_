import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateCredentials } from '@/lib/zapi/client'
import { readMessage } from '@/lib/whatsapp/sender'
import { getWhatsAppInstance } from '@/lib/whatsapp/instance'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, messageId } = body ?? {}

    if (!phone || !messageId) {
      return NextResponse.json(
        { ok: false, error: 'phone e messageId são obrigatórios' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) {
      return NextResponse.json({ ok: false, error: 'Clínica não encontrada' }, { status: 404 })
    }

    const whatsapp = await getWhatsAppInstance(profile.clinic_id)

    if (!whatsapp) {
      return NextResponse.json({ ok: false, error: 'Instância não configurada' }, { status: 404 })
    }

    const { credentials } = whatsapp

    if (!validateCredentials(credentials)) {
      return NextResponse.json({ ok: false, error: 'Credenciais inválidas' }, { status: 400 })
    }

    await readMessage(credentials, { phone, messageId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Falha ao marcar mensagem como lida' },
      { status: 500 },
    )
  }
}
