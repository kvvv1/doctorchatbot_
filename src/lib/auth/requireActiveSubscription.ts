import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { checkSubscription } from '@/lib/services/subscriptionService'

/**
 * Guard to ensure user has an active subscription
 * Call this at the top of protected dashboard pages
 * 
 * @returns Session profile if subscription is active
 * @redirects to /dashboard/billing if subscription is not active
 */
export async function requireActiveSubscription() {
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const subscriptionCheck = await checkSubscription(session.clinic.id)

	if (!subscriptionCheck.isActive) {
		redirect('/dashboard/billing')
	}

	return session
}
