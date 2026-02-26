'use client'

import Link from 'next/link'
import { type PlanKey } from '@/lib/types/database'

interface UpgradePromptProps {
	featureName: string
	requiredPlans?: string[]
	currentPlan?: PlanKey | null
	className?: string
}

/**
 * Component to show upgrade prompt for locked features
 */
export default function UpgradePrompt({
	featureName,
	requiredPlans = ['Profissional', 'Clinic Pro'],
	currentPlan,
	className = ''
}: UpgradePromptProps) {
	return (
		<div className={`bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl p-6 ${className}`}>
			<div className="flex items-start gap-4">
				<div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
					<svg
						className="w-6 h-6 text-purple-600"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
				</div>

				<div className="flex-1">
					<h3 className="text-lg font-semibold text-neutral-900 mb-1">
						{featureName}
					</h3>
					<p className="text-neutral-600 text-sm mb-4">
						Esta funcionalidade está disponível nos planos:{' '}
						<span className="font-medium text-purple-700">
							{requiredPlans.join(', ')}
						</span>
					</p>

					{currentPlan && (
						<p className="text-xs text-neutral-500 mb-4">
							Seu plano atual:{' '}
							<span className="font-medium capitalize">
								{currentPlan.replace('_', ' ')}
							</span>
						</p>
					)}

					<Link
						href="/dashboard/billing"
						className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
							/>
						</svg>
						Fazer Upgrade
					</Link>
				</div>
			</div>
		</div>
	)
}
