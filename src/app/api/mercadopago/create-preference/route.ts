import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { getMpClient } from '@/lib/mercadopago/client'
import { PreApproval } from 'mercadopago'
import { isValidPlanKey, getMpPlanId, getPlan, type PlanKey } from '@/config/plans'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mercadopago/create-preference
 * Cria uma assinatura recorrente no Mercado Pago (substitui Stripe checkout)
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { planKey } = body

    if (!planKey || !isValidPlanKey(planKey)) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    const plan = getPlan(planKey as PlanKey)
    const mpPlanId = getMpPlanId(planKey as PlanKey)

    if (!mpPlanId) {
      console.error(`MP Plan ID não configurado para o plano: ${planKey}`)
      return NextResponse.json(
        { error: 'Configuração de pagamento ausente. Entre em contato com o suporte.' },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    // Criar preapproval (assinatura recorrente) no Mercado Pago
    const preApproval = new PreApproval(getMpClient())
    const subscription = await preApproval.create({
      body: {
        preapproval_plan_id: mpPlanId,
        reason: `DoctorChatBot - ${plan.name}`,
        payer_email: session.user.email,
        back_url: `${appUrl}/dashboard/billing`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plan.priceBRL,
          currency_id: 'BRL',
        },
        external_reference: `clinic_${session.clinic.id}_plan_${planKey}`,
      },
    })

    if (!subscription.init_point) {
      throw new Error('init_point não retornado pelo Mercado Pago')
    }

    // Salvar referência inicial no banco
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('clinic_id', session.clinic.id)
      .single()

    if (existingSub) {
      await supabase
        .from('subscriptions')
        .update({
          stripe_subscription_id: subscription.id, // reutilizando coluna para mp_subscription_id
          plan_key: planKey,
          status: 'inactive', // será atualizado pelo webhook
          updated_at: new Date().toISOString(),
        })
        .eq('clinic_id', session.clinic.id)
    } else {
      await supabase.from('subscriptions').insert({
        clinic_id: session.clinic.id,
        stripe_subscription_id: subscription.id, // reutilizando coluna para mp_subscription_id
        plan_key: planKey,
        status: 'inactive',
      })
    }

    return NextResponse.json({ url: subscription.init_point })
  } catch (error) {
    console.error('Erro ao criar assinatura MP:', error)
    return NextResponse.json(
      { error: 'Falha ao criar assinatura. Tente novamente.' },
      { status: 500 }
    )
  }
}
