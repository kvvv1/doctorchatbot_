import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateCredentials, zapiReadMessage } from '@/lib/zapi/client'

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

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_id, token, client_token')
      .eq('clinic_id', profile.clinic_id)
      .eq('provider', 'zapi')
      .single()

    if (!instance) {
      return NextResponse.json({ ok: false, error: 'Instância não configurada' }, { status: 404 })
    }

    const credentials = {
      instanceId: instance.instance_id,
      token: instance.token,
      clientToken: instance.client_token || undefined,
    }

    if (!validateCredentials(credentials)) {
      return NextResponse.json({ ok: false, error: 'Credenciais inválidas' }, { status: 400 })
    }

    await zapiReadMessage(credentials, { phone, messageId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Falha ao marcar mensagem como lida' },
      { status: 500 },
    )
  }
}
