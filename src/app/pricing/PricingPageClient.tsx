'use client'

import { getMainPlans, getFounderPlan, getBadgeColorClasses, getRecommendedColorClasses, type Plan } from '@/config/plans'
import { Check, Shield, UserCheck, Zap, HeadphonesIcon, XCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface PricingPageClientProps {
	isLoggedIn: boolean
	hasActiveSubscription: boolean
}

export default function PricingPageClient({ isLoggedIn }: PricingPageClientProps) {
	const mainPlans = getMainPlans()
	const founderPlan = getFounderPlan()
	const searchParams = useSearchParams()
	const [showCancelBanner, setShowCancelBanner] = useState(false)

	useEffect(() => {
		if (searchParams.get('payment') === 'cancel') {
			setShowCancelBanner(true)
			// Remove o parâmetro da URL após 10 segundos
			const timer = setTimeout(() => {
				setShowCancelBanner(false)
			}, 10000)
			return () => clearTimeout(timer)
		}
	}, [searchParams])

	return (
		<div className="min-h-screen bg-white">
			{/* Cancel Banner */}
			{showCancelBanner && (
				<div className="bg-amber-50 border-b border-amber-200">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<XCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
								<div>
									<p className="text-sm font-medium text-amber-900">
										Pagamento cancelado
									</p>
									<p className="text-sm text-amber-700">
										Não se preocupe. Você pode escolher um plano quando estiver pronto.
									</p>
								</div>
							</div>
							<button
								onClick={() => setShowCancelBanner(false)}
								className="text-amber-600 hover:text-amber-800 transition-colors"
							>
								<XCircle className="w-5 h-5" />
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Hero Section */}
			<div className="bg-gradient-to-b from-neutral-50 to-white border-b border-neutral-200">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
					{isLoggedIn && (
						<Link
							href="/dashboard"
							className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors mb-6"
						>
							<ArrowLeft className="w-4 h-4" />
							Voltar ao Dashboard
						</Link>
					)}
					<h1 className="text-5xl font-bold text-neutral-900 mb-4 tracking-tight">
						Transforme o WhatsApp da sua clínica em um atendimento inteligente
					</h1>
					<p className="text-xl text-neutral-600 max-w-3xl mx-auto">
						Automatize agendamentos, reduza no-show e organize conversas em um painel único.
					</p>
				</div>
			</div>

			{/* Main Plans */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
				<div className="grid md:grid-cols-3 gap-8 mb-16">
					{mainPlans.map((plan) => (
						<PlanCard key={plan.key} plan={plan} isLoggedIn={isLoggedIn} />
					))}
				</div>

				{/* Founder Plan - Special Section */}
				<div className="max-w-3xl mx-auto">
					<FounderPlanCard plan={founderPlan} isLoggedIn={isLoggedIn} />
				</div>
			</div>

			{/* Trust Section */}
			<div className="bg-neutral-50 border-t border-neutral-200">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
					<div className="grid md:grid-cols-4 gap-8 text-center">
						<div className="flex flex-col items-center">
							<Shield className="w-8 h-8 text-neutral-700 mb-3" />
							<h3 className="font-semibold text-neutral-900 mb-1">Pagamento seguro</h3>
							<p className="text-sm text-neutral-600">Powered by Stripe</p>
						</div>
						<div className="flex flex-col items-center">
							<UserCheck className="w-8 h-8 text-neutral-700 mb-3" />
							<h3 className="font-semibold text-neutral-900 mb-1">Cancele quando quiser</h3>
							<p className="text-sm text-neutral-600">Sem taxas de cancelamento</p>
						</div>
						<div className="flex flex-col items-center">
							<Zap className="w-8 h-8 text-neutral-700 mb-3" />
							<h3 className="font-semibold text-neutral-900 mb-1">Ativação imediata</h3>
							<p className="text-sm text-neutral-600">Configure em minutos</p>
						</div>
						<div className="flex flex-col items-center">
							<HeadphonesIcon className="w-8 h-8 text-neutral-700 mb-3" />
							<h3 className="font-semibold text-neutral-900 mb-1">Suporte humano</h3>
							<p className="text-sm text-neutral-600">Sempre à disposição</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

interface PlanCardProps {
	plan: Plan
	isLoggedIn: boolean
}

function PlanCard({ plan, isLoggedIn }: PlanCardProps) {
	const [isCreatingCheckout, setIsCreatingCheckout] = useState(false)

	const handleSubscribe = async () => {
		if (!isLoggedIn) {
			window.location.href = '/signup'
			return
		}

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
		: 'border-neutral-200 hover:border-neutral-300'

	return (
		<div className={`bg-white rounded-2xl p-8 border-2 transition-all relative ${borderClasses}`}>
			{/* Badge */}
			{plan.badge && (
				<div className={`absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1.5 rounded-full text-sm font-semibold ${badgeClasses}`}>
					{plan.badge}
				</div>
			)}

			{/* Plan Name */}
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

function FounderPlanCard({ plan, isLoggedIn }: { plan: Plan, isLoggedIn: boolean }) {
	const [isCreatingCheckout, setIsCreatingCheckout] = useState(false)

	const handleSubscribe = async () => {
		if (!isLoggedIn) {
			window.location.href = '/signup'
			return
		}

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

	return (
		<div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-400 rounded-2xl p-8 relative overflow-hidden">
			{/* Decorative element */}
			<div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100 rounded-full opacity-20 -mr-32 -mt-32" />
			
			<div className="relative">
				{/* Badge */}
				<div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500 text-white rounded-full text-sm font-semibold mb-6">
					<span>🚀</span>
					<span>{plan.badge}</span>
				</div>

				<div className="grid md:grid-cols-2 gap-8 items-center">
					<div>
						<h2 className="text-3xl font-bold text-neutral-900 mb-2">
							Acesso Antecipado
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
