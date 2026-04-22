'use client'

import { type PlanKey } from '@/lib/types/database'
import { getPlanLimit, type PlanLimits } from '@/lib/services/planFeatures'
import Link from 'next/link'

interface UsageLimitBadgeProps {
	planKey: PlanKey | null
	limitType: keyof PlanLimits
	currentValue: number
	label: string
	className?: string
}

/**
 * Badge showing current usage vs limit
 */
export default function UsageLimitBadge({
	planKey,
	limitType,
	currentValue,
	label,
	className = '',
}: UsageLimitBadgeProps) {
	const limit = getPlanLimit(planKey, limitType)
	const isUnlimited = limit === -1
	const percentage = isUnlimited ? 0 : (currentValue / limit) * 100
	const isNearLimit = percentage >= 80
	const isAtLimit = percentage >= 100

	return (
		<div className={`bg-white border rounded-lg p-4 ${className}`}>
			<div className="flex items-center justify-between mb-2">
				<span className="text-sm font-medium text-neutral-900">{label}</span>
				{isNearLimit && !isUnlimited && (
					<Link
						href="/dashboard/billing"
						className="text-xs text-purple-600 hover:text-purple-700 font-medium"
					>
						Aumentar limite
					</Link>
				)}
			</div>

			<div className="flex items-baseline gap-2 mb-2">
				<span className="text-2xl font-bold text-neutral-900">{currentValue}</span>
				<span className="text-sm text-neutral-500">
					/ {isUnlimited ? '∞' : limit}
				</span>
			</div>

			{!isUnlimited && (
				<div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
					<div
						className={`h-full transition-all duration-300 ${
							isAtLimit
								? 'bg-red-500'
								: isNearLimit
								? 'bg-amber-500'
								: 'bg-green-500'
						}`}
						style={{ width: `${Math.min(percentage, 100)}%` }}
					/>
				</div>
			)}

			{isUnlimited && (
				<div className="flex items-center gap-1.5 text-xs text-emerald-600">
					<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
						<path
							fillRule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
							clipRule="evenodd"
						/>
					</svg>
					Ilimitado
				</div>
			)}

			{isAtLimit && (
				<p className="text-xs text-red-600 mt-2 font-medium">
					⚠️ Limite atingido
				</p>
			)}
		</div>
	)
}
