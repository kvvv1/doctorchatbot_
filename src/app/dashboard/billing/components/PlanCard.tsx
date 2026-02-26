'use client'

import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { type Plan, getBadgeColorClasses, getRecommendedColorClasses } from '@/config/plans'

interface PlanCardProps {
	plan: Plan
	isActive: boolean
	isFounder?: boolean
}

export default function PlanCard({
	plan,
	isActive,
	isFounder = false,
}: PlanCardProps) {
	const [isCreatingCheckout, setIsCreatingCheckout] = useState(false)

	const handleSubscribe = async () => {
		setIsCreatingCheckout(true)
		try {
			const response = await fetch('/api/stripe/create-checkout-session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ planKey: plan.key }),
			})

			if (response.ok) {
				const data = await response.json()
				window.location.href = data.url
			} else {
				alert('Erro ao criar sessão de pagamento')
			}
		} catch (error) {
			console.error('Error creating checkout session:', error)
			alert('Erro ao criar sessão de pagamento')
		} finally {
			setIsCreatingCheckout(false)
		}
	}

	const badgeClasses = getBadgeColorClasses(plan.badgeColor)
	const borderClasses = plan.isRecommended
		? getRecommendedColorClasses(plan.badgeColor)
		: isFounder
		? 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50'
		: 'border-neutral-200 hover:border-neutral-300'

	// Special layout for founder plan
	if (isFounder) {
		return (
			<div className={`bg-white rounded-2xl p-8 border-2 transition-all relative overflow-hidden ${borderClasses}`}>
				{/* Decorative element */}
				<div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100 rounded-full opacity-20 -mr-32 -mt-32" />
				
				<div className="relative">
					{/* Badge */}
					{plan.badge && (
						<div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 ${badgeClasses}`}>
							<Sparkles className="w-4 h-4" />
							<span>{plan.badge}</span>
						</div>
					)}

					<div className="grid md:grid-cols-2 gap-8 items-center">
						<div>
							<h2 className="text-3xl font-bold text-neutral-900 mb-2">
								{plan.name}
							</h2>
							<p className="text-neutral-700 mb-4">
								{plan.description}
							</p>
							
							<div className="flex items-baseline gap-3 mb-2">
								<span className="text-sm text-neutral-600 line-through">R$ 397</span>
								<span className="text-5xl font-bold text-emerald-700">R$ {plan.priceBRL}</span>
								<span className="text-neutral-700">/mês</span>
							</div>
							<p className="text-sm font-semibold text-emerald-700 mb-6">
								⚡ Vagas limitadas • Preço garantido para sempre
							</p>

							<button
								onClick={handleSubscribe}
								disabled={isCreatingCheckout}
								className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-100"
							>
								{isCreatingCheckout ? 'Processando...' : 'Garantir Plano Fundador'}
							</button>
							<p className="text-xs text-center text-neutral-600 mt-3">
								Oferta por tempo limitado
							</p>
						</div>

						<div>
							<ul className="space-y-2.5">
								{plan.features.map((feature, index) => (
									<li key={index} className="flex items-start gap-3">
										<Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
										<span className="text-sm text-neutral-800">{feature}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className={`bg-white rounded-2xl p-8 border-2 transition-all relative ${borderClasses}`}>
			{/* Badge */}
			{plan.badge && (
				<div className={`absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1.5 rounded-full text-sm font-semibold ${badgeClasses}`}>
					{plan.badge}
				</div>
			)}

			<div className="mt-2 mb-4">
				<h2 className="text-2xl font-bold text-neutral-900">{plan.name}</h2>
				{plan.description && (
					<p className="text-sm text-neutral-600 mt-2">{plan.description}</p>
				)}
			</div>

			{/* Price */}
			<div className="mb-8">
				<div className="flex items-baseline gap-2">
					<span className="text-5xl font-bold text-neutral-900">R$ {plan.priceBRL}</span>
					<span className="text-neutral-600">/mês</span>
				</div>
			</div>

			{/* Features */}
			<ul className="space-y-3 mb-8">
				{plan.features.map((feature, index) => (
					<li key={index} className="flex items-start gap-3">
						<Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-neutral-700" />
						<span className="text-sm text-neutral-700">{feature}</span>
					</li>
				))}
			</ul>

			{/* CTA Button */}
			<button
				onClick={handleSubscribe}
				disabled={isCreatingCheckout}
				className={`w-full py-3.5 px-6 rounded-lg font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
					plan.isRecommended
						? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-100'
						: 'bg-neutral-900 hover:bg-neutral-800 text-white'
				}`}
			>
				{isCreatingCheckout ? 'Processando...' : `Assinar ${plan.name}`}
			</button>
		</div>
	)
}
