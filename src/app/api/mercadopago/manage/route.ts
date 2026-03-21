import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { mpClient } from '@/lib/mercadopago/client'
import { PreApproval } from 'mercadopago'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mercadopago/manage
 * Cancela ou pausa a assinatura do cliente no Mercado Pago
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body // 'cancel' | 'pause'

    const supabase = await createClient()

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('clinic_id', session.clinic.id)
      .single()

    if (!subscription?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada.' },
        { status: 404 }
      )
    }

    const preApproval = new PreApproval(mpClient)

    if (action === 'cancel') {
      await preApproval.update({
        id: subscription.stripe_subscription_id,
        body: { status: 'cancelled' },
      })

      await supabase
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('clinic_id', session.clinic.id)

      await supabase
        .from('clinics')
        .update({ subscription_status: 'canceled' })
        .eq('id', session.clinic.id)

      return NextResponse.json({ success: true, message: 'Assinatura cancelada com sucesso.' })
    }

    if (action === 'pause') {
      await preApproval.update({
        id: subscription.stripe_subscription_id,
        body: { status: 'paused' },
      })

      await supabase
        .from('subscriptions')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('clinic_id', session.clinic.id)

      return NextResponse.json({ success: true, message: 'Assinatura pausada.' })
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (error) {
    console.error('Erro ao gerenciar assinatura MP:', error)
    return NextResponse.json(
      { error: 'Falha ao gerenciar assinatura.' },
      { status: 500 }
    )
  }
}
