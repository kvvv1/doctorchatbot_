import { createClient } from '@/lib/supabase/server'
import { SubscriptionStatus, PlanKey } from '@/lib/types/database'
import { hasFeatureAccess, PlanFeature, isWithinLimit, type PlanLimits } from './planFeatures'

export interface SubscriptionCheck {
	isActive: boolean
	status: SubscriptionStatus
	planKey: PlanKey | null
	currentPeriodEnd: string | null
}

/**
 * Check if a clinic has an active subscription
 * Active means: status === 'active' OR status === 'trialing'
 */
export async function checkSubscription(clinicId: string): Promise<SubscriptionCheck> {
	const supabase = await createClient()

	const { data: subscription } = await supabase
		.from('subscriptions')
		.select('status, plan_key, current_period_end')
		.eq('clinic_id', clinicId)
		.single()

	const status = subscription?.status || 'inactive'
	const isActive = status === 'active' || status === 'trialing'
	const planKey = subscription?.plan_key || null

	return {
		isActive,
		status,
		planKey,
		currentPeriodEnd: subscription?.current_period_end || null,
	}
}

/**
 * Assert that a clinic has an active subscription
 * Throws an error if subscription is not active
 */
export async function assertSubscriptionActive(clinicId: string): Promise<void> {
	const check = await checkSubscription(clinicId)

	if (!check.isActive) {
		throw new Error('Subscription is not active')
	}
}

/**
 * Check if clinic has access to a specific feature
 */
export async function checkFeatureAccess(
	clinicId: string,
	feature: PlanFeature
): Promise<boolean> {
	const check = await checkSubscription(clinicId)
	if (!check.isActive) return false
	return hasFeatureAccess(check.planKey, feature)
}

/**
 * Assert that clinic has access to a feature
 * Throws error if no access
 */
export async function assertFeatureAccess(
	clinicId: string,
	feature: PlanFeature
): Promise<void> {
	const hasAccess = await checkFeatureAccess(clinicId, feature)
	if (!hasAccess) {
		throw new Error(`Feature not available in current plan: ${feature}`)
	}
}

/**
 * Check if clinic is within a specific limit
 */
export async function checkPlanLimit(
	clinicId: string,
	limitType: keyof PlanLimits,
	currentValue: number
): Promise<boolean> {
	const check = await checkSubscription(clinicId)
	if (!check.isActive) return false
	return isWithinLimit(check.planKey, limitType, currentValue)
}

