import { createAdminClient } from '@/lib/supabase/admin'
import { SubscriptionStatus, PlanKey } from '@/lib/types/database'
import { hasFeatureAccess, PlanFeature, isWithinLimit, type PlanLimits } from './planFeatures'

export interface SubscriptionCheck {
	isActive: boolean
	status: SubscriptionStatus
	planKey: PlanKey | null
	currentPeriodEnd: string | null
}

function isSubscriptionStatus(value: string | null | undefined): value is SubscriptionStatus {
	return value === 'inactive' || value === 'active' || value === 'trialing' || value === 'past_due' || value === 'canceled'
}

function isPlanKey(value: string | null | undefined): value is PlanKey {
	return value === 'essencial' || value === 'profissional' || value === 'clinic_pro' || value === 'fundador'
}

/**
 * Check if a clinic has an active subscription
 * Active means: status === 'active' OR status === 'trialing'
 */
export async function checkSubscription(clinicId: string): Promise<SubscriptionCheck> {
	const supabase = createAdminClient()

	const { data: subscription, error: subscriptionError } = await supabase
		.from('subscriptions')
		.select('status, plan_key, current_period_end')
		.eq('clinic_id', clinicId)
		.maybeSingle()

	if (subscriptionError) {
		console.error('[checkSubscription] Failed to fetch subscriptions row:', subscriptionError)
	}

	const subscriptionStatus = subscription?.status
	const subscriptionPlanKey = subscription?.plan_key

	if (isSubscriptionStatus(subscriptionStatus)) {
		return {
			isActive: subscriptionStatus === 'active' || subscriptionStatus === 'trialing',
			status: subscriptionStatus,
			planKey: isPlanKey(subscriptionPlanKey) ? subscriptionPlanKey : null,
			currentPeriodEnd: subscription?.current_period_end || null,
		}
	}

	const { data: clinic, error: clinicError } = await supabase
		.from('clinics')
		.select('plan, subscription_status')
		.eq('id', clinicId)
		.maybeSingle()

	if (clinicError) {
		console.error('[checkSubscription] Failed to fetch clinic fallback row:', clinicError)
	}

	const status = isSubscriptionStatus(clinic?.subscription_status) ? clinic.subscription_status : 'inactive'
	const isActive = status === 'active' || status === 'trialing'
	const planKey = isPlanKey(clinic?.plan) ? clinic.plan : null

	return {
		isActive,
		status,
		planKey,
		currentPeriodEnd: null,
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

