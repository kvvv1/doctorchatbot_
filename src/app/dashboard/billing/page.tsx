import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { checkSubscription } from '@/lib/services/subscriptionService'
import BillingPageClient from './BillingPageClient'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
	title: 'Assinatura | Doctor Chat Bot',
	description: 'Gerencie sua assinatura',
}

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const supabase = await createClient()

	// Get subscription details
	const { data: subscription } = await supabase
		.from('subscriptions')
		.select('*')
		.eq('clinic_id', session.clinic.id)
		.single()

	const subscriptionCheck = await checkSubscription(session.clinic.id)

	return (
		<BillingPageClient
			subscription={subscription}
			subscriptionCheck={subscriptionCheck}
			clinicId={session.clinic.id}
		/>
	)
}
