'use client'

import { Subscription } from '@/lib/types/database'
import { SubscriptionCheck } from '@/lib/services/subscriptionService'
import BillingHero from './components/BillingHero'
import CurrentPlanCard from './components/CurrentPlanCard'
import PlanCard from './components/PlanCard'
import BillingTrustSection from './components/BillingTrustSection'
import { getMainPlans, getFounderPlan } from '@/config/plans'
import Link from 'next/link'

interface BillingPageClientProps {
	subscription: Subscription | null
	subscriptionCheck: SubscriptionCheck
	clinicId: string
}

export default function BillingPageClient({
	subscription,
	subscriptionCheck,
}: BillingPageClientProps) {
	const mainPlans = getMainPlans()
	const founderPlan = getFounderPlan()
	const allPlans = [...mainPlans, founderPlan]

	return (
		<div className="min-h-screen bg-white">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
				{/* No subscription banner */}
				{!subscriptionCheck.isActive && (
					<div className="mb-8 bg-amber-50 border border-amber-200 rounded-lg p-6">
						<div className="flex items-start gap-4">
							<div className="flex-shrink-0">
								<svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
							</div>
							<div className="flex-1">
								<h3 className="text-sm font-semibold text-amber-900 mb-1">
									Nenhuma assinatura ativa
								</h3>
								<p className="text-sm text-amber-800 mb-3">
									Escolha um plano abaixo para começar a automatizar o atendimento da sua clínica.
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Hero Section */}
				<div className="grid lg:grid-cols-3 gap-10 mb-20">
					<div className="lg:col-span-2">
						<BillingHero isActive={subscriptionCheck.isActive} />
					</div>
					{subscriptionCheck.isActive && (
						<CurrentPlanCard
							isActive={subscriptionCheck.isActive}
							status={subscriptionCheck.status}
							currentPeriodEnd={subscriptionCheck.currentPeriodEnd}
							hasStripeCustomer={!!subscription?.stripe_customer_id}
							planKey={subscriptionCheck.planKey}
						/>
					)}
				</div>

				{/* Plans Section */}
				<div className="mb-20">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold text-neutral-900 mb-3 tracking-tight">
							{subscriptionCheck.isActive ? 'Faça upgrade do seu plano' : 'Escolha seu plano'}
						</h2>
						<p className="text-neutral-600">
							Transparente, sem surpresas. Cancele quando quiser.
						</p>
					</div>

					<div className="grid md:grid-cols-3 gap-6 mb-8">
						{mainPlans.map((plan) => (
							<PlanCard
								key={plan.key}
								plan={plan}
								isActive={subscriptionCheck.isActive}
							/>
						))}
					</div>

					{/* Founder Plan */}
					<div className="max-w-3xl mx-auto mt-12">
						<PlanCard
							plan={founderPlan}
							isActive={subscriptionCheck.isActive}
							isFounder
						/>
					</div>
				</div>

				{/* Trust Section */}
				<BillingTrustSection />
			</div>
		</div>
	)
}
