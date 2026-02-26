import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PricingPageClient from './PricingPageClient'

export const metadata: Metadata = {
	title: 'Planos | Doctor Chat Bot',
	description: 'Transforme o WhatsApp da sua clínica em um atendimento inteligente',
}

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
	const supabase = await createClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()

	let hasActiveSubscription = false

	// If user is logged in and has an active subscription, redirect to dashboard
	if (user) {
		const profile = await supabase
			.from('profiles')
			.select('clinic_id')
			.eq('user_id', user.id)
			.single()

		if (profile.data?.clinic_id) {
			const subscription = await supabase
				.from('subscriptions')
				.select('status')
				.eq('clinic_id', profile.data.clinic_id)
				.single()

			if (subscription.data?.status === 'active' || subscription.data?.status === 'trialing') {
				hasActiveSubscription = true
				redirect('/dashboard')
			}
		}
	}

	return <PricingPageClient isLoggedIn={!!user} hasActiveSubscription={hasActiveSubscription} />
}
