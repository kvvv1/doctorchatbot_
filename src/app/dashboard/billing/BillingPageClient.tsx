'use client'

import { Subscription } from '@/lib/types/database'
import { SubscriptionCheck } from '@/lib/services/subscriptionService'
import CurrentPlanCard from './components/CurrentPlanCard'
import PlanCard from './components/PlanCard'
import BillingTrustSection from './components/BillingTrustSection'
import { getMainPlans, getFounderPlan } from '@/config/plans'

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

	return (
		<div className="min-h-screen bg-neutral-50">
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

				{/* Título da página */}
				<div className="mb-8">
					<h1 className="text-2xl font-bold text-neutral-900">Assinatura</h1>
					<p className="text-sm text-neutral-500 mt-1">
						Gerencie seu plano e visualize os detalhes da sua assinatura.
					</p>
				</div>

				{/* Card de assinatura atual — sempre visível */}
				<div className="mb-10">
					<CurrentPlanCard
						isActive={subscriptionCheck.isActive}
						status={subscriptionCheck.status}
						currentPeriodEnd={subscriptionCheck.currentPeriodEnd}
						hasStripeCustomer={!!subscription?.stripe_customer_id}
						planKey={subscriptionCheck.planKey}
						subscription={subscription}
					/>
				</div>

				{/* Seção de planos */}
				<div>
					<div className="mb-6">
						<h2 className="text-xl font-semibold text-neutral-900">
							{subscriptionCheck.isActive ? 'Fazer upgrade do plano' : 'Escolha seu plano'}
						</h2>
						<p className="text-sm text-neutral-500 mt-1">
							Transparente, sem surpresas. Cancele quando quiser.
						</p>
					</div>

					<div className="grid md:grid-cols-3 gap-5 mb-8">
						{mainPlans.map((plan) => (
							<PlanCard
								key={plan.key}
								plan={plan}
								isActive={subscriptionCheck.isActive}
							/>
						))}
					</div>

					{/* Plano Fundador */}
					<div className="max-w-3xl mx-auto mt-8">
						<PlanCard
							plan={founderPlan}
							isActive={subscriptionCheck.isActive}
							isFounder
						/>
					</div>
				</div>

				{/* Trust Section */}
				<div className="mt-16">
					<BillingTrustSection />
				</div>
			</div>
		</div>
	)
}

	)
}
