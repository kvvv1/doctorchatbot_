import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { mpClient } from '@/lib/mercadopago/client'
import { PreApproval, Payment } from 'mercadopago'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/mercadopago
 * Recebe notificações de eventos do Mercado Pago (assinaturas e pagamentos)
 */
export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()

  // Validar assinatura do webhook MP
  const xSignature = headersList.get('x-signature')
  const xRequestId = headersList.get('x-request-id')
  const webhookSecret = process.env.MP_WEBHOOK_SECRET

  if (webhookSecret && xSignature && xRequestId) {
    const params = new URLSearchParams(new URL(request.url).search)
    const dataId = params.get('data.id') || ''
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${xSignature.split(',').find(s => s.startsWith('ts='))?.replace('ts=', '') || ''};`
    const expectedHash = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex')
    const receivedHash = xSignature.split(',').find(s => s.startsWith('v1='))?.replace('v1=', '')

    if (receivedHash && expectedHash !== receivedHash) {
      console.error('[MP Webhook] Assinatura inválida')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log(`[MP Webhook] Evento recebido: ${payload.type} - ID: ${payload.data?.id}`)

  try {
    switch (payload.type) {
      case 'subscription_preapproval': {
        await handleSubscriptionEvent(payload.data?.id)
        break
      }
      case 'payment': {
        await handlePaymentEvent(payload.data?.id)
        break
      }
      default:
        console.log(`[MP Webhook] Tipo não tratado: ${payload.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[MP Webhook] Erro ao processar evento:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

/**
 * Trata eventos de assinatura (preapproval)
 */
async function handleSubscriptionEvent(subscriptionId: string) {
  if (!subscriptionId) return

  const preApproval = new PreApproval(mpClient)
  const subscription = await preApproval.get({ id: subscriptionId })

  const supabase = createAdminClient()

  // Extrair clinic_id do external_reference: "clinic_{id}_plan_{key}"
  const externalRef = subscription.external_reference || ''
  const clinicMatch = externalRef.match(/clinic_([^_]+)/)
  const planMatch = externalRef.match(/plan_(.+)$/)
  const clinicId = clinicMatch?.[1]
  const planKey = planMatch?.[1]

  if (!clinicId) {
    console.error('[MP Webhook] clinic_id não encontrado no external_reference:', externalRef)
    return
  }

  const status = mapMpStatus(subscription.status)

  // Calcular próxima cobrança
  const nextPaymentDate = subscription.auto_recurring?.end_date
    ? new Date(subscription.auto_recurring.end_date).toISOString()
    : null

  const updateData: any = {
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: subscription.payer_id?.toString() || null,
    status,
    updated_at: new Date().toISOString(),
  }

  if (nextPaymentDate) updateData.current_period_end = nextPaymentDate
  if (planKey) updateData.plan_key = planKey

  const { error } = await supabase
    .from('subscriptions')
    .upsert({ clinic_id: clinicId, ...updateData }, { onConflict: 'clinic_id' })

  if (error) {
    console.error('[MP Webhook] Erro ao atualizar subscription:', error)
    throw error
  }

  await supabase
    .from('clinics')
    .update({ subscription_status: status })
    .eq('id', clinicId)

  console.log(`[MP Webhook] Assinatura ${subscriptionId} atualizada: ${status} para clínica ${clinicId}`)
}

/**
 * Trata eventos de pagamento individual
 */
async function handlePaymentEvent(paymentId: string) {
  if (!paymentId) return

  const payment = new Payment(mpClient)
  const paymentData = await payment.get({ id: paymentId })

  // Pagamentos de assinatura têm preapproval_id
  const preapprovalId = (paymentData as any).preapproval_id
  if (!preapprovalId) return

  const supabase = createAdminClient()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('clinic_id')
    .eq('stripe_subscription_id', preapprovalId)
    .single()

  if (!subscription?.clinic_id) return

  if (paymentData.status === 'approved') {
    await supabase
      .from('subscriptions')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('clinic_id', subscription.clinic_id)

    await supabase
      .from('clinics')
      .update({ subscription_status: 'active' })
      .eq('id', subscription.clinic_id)

    console.log(`[MP Webhook] Pagamento aprovado para clínica ${subscription.clinic_id}`)
  } else if (paymentData.status === 'rejected') {
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('clinic_id', subscription.clinic_id)

    console.log(`[MP Webhook] Pagamento rejeitado para clínica ${subscription.clinic_id}`)
  }
}

/**
 * Mapeia status do MP para status interno
 */
function mapMpStatus(
  mpStatus: string | undefined
): 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled' {
  switch (mpStatus) {
    case 'authorized':
      return 'active'
    case 'pending':
      return 'inactive'
    case 'paused':
      return 'inactive'
    case 'cancelled':
      return 'canceled'
    default:
      return 'inactive'
  }
}
