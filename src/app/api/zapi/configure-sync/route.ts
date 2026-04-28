import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMissingCredentials, validateCredentials } from '@/lib/zapi/client'
import { updateWebhookReceived } from '@/lib/whatsapp/sender'
import { getWhatsAppInstance } from '@/lib/whatsapp/instance'

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

    const whatsapp = await getWhatsAppInstance(profile.clinic_id)

    if (!whatsapp) {
      return NextResponse.json({ ok: false, error: 'Instância WhatsApp não configurada' }, { status: 404 })
    }

    const { credentials } = whatsapp

    if (!validateCredentials(credentials)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Credenciais incompletas: ${getMissingCredentials(credentials).join(', ')}`,
        },
        { status: 400 },
      )
    }

    // Aponta para o webhook correto de acordo com o provider
    const webhookPath = credentials.provider === 'evolution'
      ? '/api/webhooks/evolution'
      : '/api/webhooks/zapi'
    const webhookUrl = new URL(webhookPath, request.nextUrl.origin).toString()

    await updateWebhookReceived(credentials, webhookUrl)

    return NextResponse.json({
      ok: true,
      webhookUrl,
      provider: credentials.provider,
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
