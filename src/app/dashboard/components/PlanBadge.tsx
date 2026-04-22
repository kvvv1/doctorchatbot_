'use client'

import { type PlanKey } from '@/lib/types/database'
import { getPlan } from '@/config/plans'

interface PlanBadgeProps {
	planKey: PlanKey | null
	showPrice?: boolean
	className?: string
}

/**
 * Badge to display current plan
 */
export default function PlanBadge({ planKey, showPrice = false, className = '' }: PlanBadgeProps) {
	if (!planKey) {
		return (
			<span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-900 ${className}`}>
				<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
					<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
				</svg>
				Sem plano
			</span>
		)
	}

	const plan = getPlan(planKey)
	const colorClasses = {
		essencial: 'bg-blue-100 text-blue-700 border-blue-200',
		profissional: 'bg-purple-100 text-purple-700 border-purple-200',
		clinic_pro: 'bg-amber-100 text-amber-700 border-amber-200',
		fundador: 'bg-emerald-100 text-emerald-700 border-emerald-200',
	}

	return (
		<span
			className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${colorClasses[planKey]} ${className}`}
		>
			<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
				<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
			</svg>
			{plan.name}
			{showPrice && <span className="opacity-70">· R$ {plan.priceBRL}/mês</span>}
		</span>
	)
}
