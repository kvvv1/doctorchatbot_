import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { stripe } from '@/lib/stripe/client'

export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/create-portal-session
 * Creates a Stripe customer portal session for managing subscription
 */
export async function POST() {
	try {
		// Check authentication
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const supabase = await createClient()

		// Get subscription with customer ID
		const subscription = await supabase
			.from('subscriptions')
			.select('stripe_customer_id')
			.eq('clinic_id', session.clinic.id)
			.single()

		if (!subscription.data?.stripe_customer_id) {
			return NextResponse.json(
				{ error: 'No customer found. Please create a subscription first.' },
				{ status: 404 }
			)
		}

		// Get app URL
		const appUrl = process.env.APP_URL || 'http://localhost:3000'

		// Create portal session
		const portalSession = await stripe.billingPortal.sessions.create({
			customer: subscription.data.stripe_customer_id,
			return_url: `${appUrl}/dashboard/billing`,
		})

		return NextResponse.json({ url: portalSession.url })
	} catch (error) {
		console.error('Error creating portal session:', error)
		return NextResponse.json(
			{ error: 'Failed to create portal session' },
			{ status: 500 }
		)
	}
}

/**
 * GET /api/stripe/create-portal-session
 * Redirects to portal session (convenience for links)
 */
export async function GET() {
	try {
		const response = await POST()
		const data = await response.json()

		if (data.url) {
			return NextResponse.redirect(data.url)
		}

		return NextResponse.json(data, { status: response.status })
	} catch (error) {
		console.error('Error in GET portal session:', error)
		return NextResponse.json(
			{ error: 'Failed to create portal session' },
			{ status: 500 }
		)
	}
}
