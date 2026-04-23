import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getMissingCredentials,
  validateCredentials,
  zapiUpdateNotifySentByMe,
  zapiUpdateWebhookReceived,
} from '@/lib/zapi/client'

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.clinic_id) {
      return NextResponse.json({ ok: false, error: 'Clínica não encontrada' }, { status: 404 })
    }

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
      return NextResponse.json(
        {
          ok: false,
          error: `Credenciais incompletas: ${getMissingCredentials(credentials).join(', ')}`,
        },
        { status: 400 },
      )
    }

    const webhookUrl = new URL('/api/webhooks/zapi', request.nextUrl.origin).toString()

    await zapiUpdateWebhookReceived(credentials, webhookUrl)
    await zapiUpdateNotifySentByMe(credentials, true)

    return NextResponse.json({
      ok: true,
      webhookUrl,
      notifySentByMe: true,
      autoReadMessage: false,
    })
  } catch (error) {
    console.error('[Z-API Configure Sync] Failed:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao configurar sincronização',
      },
      { status: 500 },
    )
  }
}
