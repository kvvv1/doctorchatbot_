'use client'

import { type PlanKey } from '@/lib/types/database'
import { hasFeatureAccess, type PlanFeature, getFeatureName } from '@/lib/services/planFeatures'
import UpgradePrompt from './UpgradePrompt'

interface FeatureGateProps {
	children: React.ReactNode
	feature: PlanFeature
	planKey: PlanKey | null
	requiredPlans?: string[]
	fallback?: React.ReactNode
	showUpgrade?: boolean
}

/**
 * Component that gates features based on plan
 * Shows children if user has access, otherwise shows upgrade prompt or fallback
 */
export default function FeatureGate({
	children,
	feature,
	planKey,
	requiredPlans,
	fallback,
	showUpgrade = true,
}: FeatureGateProps) {
	const hasAccess = hasFeatureAccess(planKey, feature)

	if (hasAccess) {
		return <>{children}</>
	}

	if (fallback) {
		return <>{fallback}</>
	}

	if (showUpgrade) {
		return (
			<UpgradePrompt
				featureName={getFeatureName(feature)}
				requiredPlans={requiredPlans}
				currentPlan={planKey}
			/>
		)
	}

	return null
}
