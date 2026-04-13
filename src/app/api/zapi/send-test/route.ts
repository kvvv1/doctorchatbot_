import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { zapiSendText, validateCredentials } from '@/lib/zapi/client'
import { assertSubscriptionActive } from '@/lib/services/subscriptionService'

/**
 * POST /api/zapi/send-test
 *
 * Envia uma mensagem de teste para validar rapidamente se a integração WhatsApp
 * está operacional para a clínica autenticada.
 *
 * Body:
 * {
 *   phone: string,
 *   text?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.clinic_id) {
      return NextResponse.json({ ok: false, error: 'Clínica não encontrada' }, { status: 404 })
    }

    const clinicId = profile.clinic_id

    try {
      await assertSubscriptionActive(clinicId)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Assinatura inativa. Acesse /dashboard/billing para regularizar.' },
        { status: 402 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const phone = typeof body.phone === 'string' ? body.phone : ''
    const text = typeof body.text === 'string' && body.text.trim().length > 0
      ? body.text.trim()
      : `Teste de conexão do Doctor Chat Bot em ${new Date().toLocaleString('pt-BR')}`

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return NextResponse.json(
        { ok: false, error: 'Informe um número válido com DDD para o teste.' },
        { status: 400 }
      )
    }

    const { data: instance, error: instanceError } = await admin
      .from('whatsapp_instances')
      .select('instance_id, token, client_token, status')
      .eq('clinic_id', clinicId)
      .eq('provider', 'zapi')
      .single()

    if (instanceError || !instance) {
      return NextResponse.json(
        { ok: false, error: 'WhatsApp não configurado para esta clínica.' },
        { status: 404 }
      )
    }

    const credentials = {
      instanceId: instance.instance_id,
      token: instance.token,
      clientToken: instance.client_token || undefined,
    }

    if (!validateCredentials(credentials)) {
      return NextResponse.json(
        { ok: false, error: 'Credenciais da instância inválidas ou incompletas.' },
        { status: 400 }
      )
    }

    const result = await zapiSendText(credentials, phone, text)

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: 'Falha ao enviar mensagem de teste.' },
        { status: 500 }
      )
    }

    await supabase.from('logs').insert({
      clinic_id: clinicId,
      level: 'info',
      action: 'zapi.send_test.success',
      message: 'Mensagem de teste enviada com sucesso',
      metadata: {
        phone: phone.replace(/\D/g, ''),
        messageId: result.messageId,
      },
    })

    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (error) {
    console.error('[Z-API Send Test] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, error: 'Erro inesperado ao enviar mensagem de teste.' },
      { status: 500 }
    )
  }
}
