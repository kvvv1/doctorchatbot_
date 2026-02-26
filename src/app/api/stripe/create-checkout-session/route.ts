import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { stripe } from '@/lib/stripe/client'
import { isValidPlanKey, getStripePriceId, getPlan, type PlanKey } from '@/config/plans'

export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/create-checkout-session
 * Creates a Stripe checkout session for subscription
 */
export async function POST(request: Request) {
	try {
		// Check authentication
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Get and validate planKey from request body
		const body = await request.json()
		const { planKey } = body

		if (!planKey || !isValidPlanKey(planKey)) {
			return NextResponse.json(
				{ error: 'Invalid plan selected' },
				{ status: 400 }
			)
		}

		// Get plan details
		const plan = getPlan(planKey as PlanKey)

		// Get Stripe Price ID from environment
		const priceId = getStripePriceId(planKey as PlanKey)
		if (!priceId) {
			console.error(`Stripe Price ID not configured for plan: ${planKey}`)
			return NextResponse.json(
				{ error: 'Payment configuration error. Please contact support.' },
				{ status: 500 }
			)
		}

		const supabase = await createClient()
		
		// Get or create subscription record
		let subscription = await supabase
			.from('subscriptions')
			.select('*')
			.eq('clinic_id', session.clinic.id)
			.single()

		let stripeCustomerId = subscription.data?.stripe_customer_id

		// Create Stripe customer if it doesn't exist
		if (!stripeCustomerId) {
			const customer = await stripe.customers.create({
				email: session.user.email,
				metadata: {
					clinic_id: session.clinic.id,
					user_id: session.user.id,
				},
			})
			stripeCustomerId = customer.id

			// Save customer ID to database
			if (subscription.data) {
				// Update existing record
				await supabase
					.from('subscriptions')
					.update({ stripe_customer_id: stripeCustomerId })
					.eq('clinic_id', session.clinic.id)
			} else {
				// Create new record
				await supabase
					.from('subscriptions')
					.insert({
						clinic_id: session.clinic.id,
						stripe_customer_id: stripeCustomerId,
						status: 'inactive',
					})
			}
		}

		// Get app URL
		const appUrl = process.env.APP_URL || 'http://localhost:3000'

		// Create checkout session
		const checkoutSession = await stripe.checkout.sessions.create({
			customer: stripeCustomerId,
			mode: 'subscription',
			payment_method_types: ['card'],
			line_items: [
				{
					price: priceId,
					quantity: 1,
				},
			],
			success_url: `${appUrl}/dashboard?payment=success`,
			cancel_url: `${appUrl}/pricing?payment=cancel`,
			metadata: {
				clinic_id: session.clinic.id,
				user_id: session.user.id,
				plan_key: planKey,
				plan_name: plan.name,
			},
			subscription_data: {
				metadata: {
					clinic_id: session.clinic.id,
					user_id: session.user.id,
					plan_key: planKey,
					plan_name: plan.name,
				},
			},
		})

		return NextResponse.json({ url: checkoutSession.url })
	} catch (error) {
		console.error('Error creating checkout session:', error)
		return NextResponse.json(
			{ error: 'Failed to create checkout session' },
			{ status: 500 }
		)
	}
}

/**
 * GET /api/stripe/create-checkout-session
 * Redirects to checkout session (convenience for links)
 * @deprecated Use POST with planKey in body instead
 */
export async function GET() {
	return NextResponse.json(
		{ error: 'Please use POST with planKey in request body' },
		{ status: 400 }
	)
}

