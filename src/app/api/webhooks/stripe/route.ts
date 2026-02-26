import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe/client'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events for subscription management
 */
export async function POST(request: Request) {
	const body = await request.text()
	const headersList = await headers()
	const signature = headersList.get('stripe-signature')

	if (!signature) {
		console.error('Missing stripe-signature header')
		return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
	}

	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
	if (!webhookSecret) {
		console.error('STRIPE_WEBHOOK_SECRET is not configured')
		return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
	}

	let event: Stripe.Event

	try {
		event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
	} catch (error) {
		console.error('Webhook signature verification failed:', error)
		return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
	}

	console.log(`Received Stripe event: ${event.type}`)

	try {
		switch (event.type) {
			case 'checkout.session.completed': {
				const session = event.data.object as Stripe.Checkout.Session
				await handleCheckoutCompleted(session)
				break
			}

			case 'customer.subscription.created':
			case 'customer.subscription.updated': {
				const subscription = event.data.object as Stripe.Subscription
				await handleSubscriptionChange(subscription)
				break
			}

			case 'customer.subscription.deleted': {
				const subscription = event.data.object as Stripe.Subscription
				await handleSubscriptionDeleted(subscription)
				break
			}

			case 'invoice.payment_succeeded': {
				const invoice = event.data.object as Stripe.Invoice
				await handleInvoicePaymentSucceeded(invoice)
				break
			}

			case 'invoice.payment_failed': {
				const invoice = event.data.object as Stripe.Invoice
				await handleInvoicePaymentFailed(invoice)
				break
			}

			default:
				console.log(`Unhandled event type: ${event.type}`)
		}

		return NextResponse.json({ received: true })
	} catch (error) {
		console.error('Error processing webhook:', error)
		return NextResponse.json(
			{ error: 'Webhook processing failed' },
			{ status: 500 }
		)
	}
}

/**
 * Handle checkout.session.completed
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
	const clinicId = session.metadata?.clinic_id
	const planKey = session.metadata?.plan_key
	
	if (!clinicId) {
		console.error('Missing clinic_id in checkout session metadata')
		return
	}

	const supabase = createAdminClient()

	// Update subscription with customer ID and plan key
	const updateData: any = {
		stripe_customer_id: session.customer as string,
	}
	
	if (planKey) {
		updateData.plan_key = planKey
	}
	
	await supabase
		.from('subscriptions')
		.update(updateData)
		.eq('clinic_id', clinicId)

	console.log(`Checkout completed for clinic: ${clinicId}, plan: ${planKey}`)
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionChange(subscription: Stripe.Subscription) {
	const clinicId = subscription.metadata?.clinic_id
	const planKey = subscription.metadata?.plan_key
	
	if (!clinicId) {
		console.error('Missing clinic_id in subscription metadata')
		return
	}

	const supabase = createAdminClient()

	// Map Stripe status to our status
	const status = mapStripeStatus(subscription.status)

	// Get current_period_end timestamp - use type assertion since Stripe SDK types vary
	const currentPeriodEnd = (subscription as any).current_period_end
		? new Date((subscription as any).current_period_end * 1000).toISOString()
		: null

	// Prepare update data
	const updateData: any = {
		clinic_id: clinicId,
		stripe_customer_id: subscription.customer as string,
		stripe_subscription_id: subscription.id,
		stripe_price_id: subscription.items.data[0]?.price.id || null,
		status,
		current_period_end: currentPeriodEnd,
		updated_at: new Date().toISOString(),
	}
	
	if (planKey) {
		updateData.plan_key = planKey
	}

	// Update subscription in database
	const { error } = await supabase
		.from('subscriptions')
		.upsert(updateData, {
			onConflict: 'clinic_id',
		})

	if (error) {
		console.error('Error updating subscription:', error)
		throw error
	}

	// Also update clinics table for quick reference
	await supabase
		.from('clinics')
		.update({
			subscription_status: status,
		})
		.eq('id', clinicId)

	console.log(`Subscription ${subscription.id} updated to status: ${status}`)
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
	const clinicId = subscription.metadata?.clinic_id
	if (!clinicId) {
		console.error('Missing clinic_id in subscription metadata')
		return
	}

	const supabase = createAdminClient()

	// Mark subscription as canceled
	const { error } = await supabase
		.from('subscriptions')
		.update({
			status: 'canceled',
			updated_at: new Date().toISOString(),
		})
		.eq('clinic_id', clinicId)

	if (error) {
		console.error('Error marking subscription as canceled:', error)
		throw error
	}

	// Also update clinics table
	await supabase
		.from('clinics')
		.update({
			subscription_status: 'canceled',
		})
		.eq('id', clinicId)

	console.log(`Subscription ${subscription.id} canceled for clinic: ${clinicId}`)
}

/**
 * Handle invoice payment succeeded
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
	// Use type assertion since invoice.subscription type varies
	const subscriptionId = (invoice as any).subscription
	if (!subscriptionId || typeof subscriptionId !== 'string') return

	// Fetch the full subscription to get metadata
	const subscription = await stripe.subscriptions.retrieve(subscriptionId)
	const clinicId = subscription.metadata?.clinic_id

	if (!clinicId) {
		console.error('Missing clinic_id in subscription metadata')
		return
	}

	const supabase = createAdminClient()

	// Ensure subscription is marked as active
	await supabase
		.from('subscriptions')
		.update({
			status: 'active',
			updated_at: new Date().toISOString(),
		})
		.eq('clinic_id', clinicId)

	console.log(`Invoice ${invoice.id} paid for clinic: ${clinicId}`)
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
	// Use type assertion since invoice.subscription type varies
	const subscriptionId = (invoice as any).subscription
	if (!subscriptionId || typeof subscriptionId !== 'string') return

	// Fetch the full subscription to get metadata
	const subscription = await stripe.subscriptions.retrieve(subscriptionId)
	const clinicId = subscription.metadata?.clinic_id

	if (!clinicId) {
		console.error('Missing clinic_id in subscription metadata')
		return
	}

	const supabase = createAdminClient()

	// Mark subscription as past_due
	await supabase
		.from('subscriptions')
		.update({
			status: 'past_due',
			updated_at: new Date().toISOString(),
		})
		.eq('clinic_id', clinicId)

	console.log(`Invoice ${invoice.id} payment failed for clinic: ${clinicId}`)
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(
	stripeStatus: Stripe.Subscription.Status
): 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled' {
	switch (stripeStatus) {
		case 'active':
			return 'active'
		case 'trialing':
			return 'trialing'
		case 'past_due':
			return 'past_due'
		case 'canceled':
		case 'unpaid':
		case 'incomplete':
		case 'incomplete_expired':
		case 'paused':
			return 'canceled'
		default:
			return 'inactive'
	}
}
