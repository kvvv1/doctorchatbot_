'use client'

import { CreditCard, Calendar, CheckCircle, XCircle, Clock, AlertTriangle, Check, Shield, Headphones, Zap } from 'lucide-react'
import { useState } from 'react'
import { PlanKey, Subscription } from '@/lib/types/database'
import { PLANS } from '@/config/plans'

interface CurrentPlanCardProps {
	isActive: boolean
	status: string
	currentPeriodEnd: string | null
	hasStripeCustomer: boolean
	planKey: PlanKey | null
	subscription: Subscription | null
}

export default function CurrentPlanCard({
	isActive,
	status,
	currentPeriodEnd,
	planKey,
	subscription,
}: CurrentPlanCardProps) {
	const [isCanceling, setIsCanceling] = useState(false)
	const [cancelSuccess, setCancelSuccess] = useState(false)

	const handleCancelSubscription = async () => {
		const confirmed = window.confirm(
			'Tem certeza que deseja cancelar sua assinatura? Seu acesso permanece ativo até o fim do período atual.'
		)
		if (!confirmed) return

		setIsCanceling(true)
		try {
			const response = await fetch('/api/mercadopago/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'cancel' }),
			})
			if (response.ok) {
				setCancelSuccess(true)
				setTimeout(() => window.location.reload(), 2000)
			} else {
				alert('Erro ao cancelar. Entre em contato com o suporte.')
			}
		} catch {
			alert('Erro ao cancelar. Entre em contato com o suporte.')
		} finally {
			setIsCanceling(false)
		}
	}

	const formatDate = (dateString: string | null) => {
		if (!dateString) return null
		return new Date(dateString).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
		})
	}

	const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
		active: {
			label: 'Ativa',
			icon: <CheckCircle className="w-4 h-4" />,
			className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		},
		trialing: {
			label: 'Em teste',
			icon: <Clock className="w-4 h-4" />,
			className: 'bg-blue-50 text-blue-700 border-blue-200',
		},
		past_due: {
			label: 'Pagamento pendente',
			icon: <AlertTriangle className="w-4 h-4" />,
			className: 'bg-amber-50 text-amber-700 border-amber-200',
		},
		canceled: {
			label: 'Cancelada',
			icon: <XCircle className="w-4 h-4" />,
			className: 'bg-red-50 text-red-700 border-red-200',
		},
		inactive: {
			label: 'Inativa',
			icon: <XCircle className="w-4 h-4" />,
			className: 'bg-neutral-100 text-neutral-600 border-neutral-300',
		},
	}

	const currentStatus = statusConfig[status] ?? statusConfig.inactive
	const plan = planKey ? PLANS[planKey] : null
	const renewalDate = formatDate(currentPeriodEnd)
	const startDate = formatDate(subscription?.created_at ?? null)

	const planColorMap: Record<PlanKey, string> = {
		essencial: 'from-blue-600 to-blue-700',
		profissional: 'from-purple-600 to-purple-700',
		clinic_pro: 'from-amber-500 to-amber-600',
		fundador: 'from-emerald-600 to-teal-600',
	}
	const gradientClass = planKey ? planColorMap[planKey] : 'from-neutral-500 to-neutral-600'

	if (!isActive && !plan) {
		return (
			<div className="bg-white border-2 border-dashed border-neutral-200 rounded-2xl p-8 text-center">
				<div className="w-14 h-14 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
					<CreditCard className="w-7 h-7 text-neutral-400" />
				</div>
				<h3 className="text-lg font-semibold text-neutral-700 mb-2">Nenhuma assinatura ativa</h3>
				<p className="text-sm text-neutral-500">Escolha um plano abaixo para começar.</p>
			</div>
		)
	}

	return (
		<div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
			{/* Header colorido com o plano */}
			<div className={`bg-gradient-to-r ${gradientClass} p-6 text-white`}>
				<div className="flex items-start justify-between">
					<div>
						<div className="text-sm font-medium opacity-80 mb-1">Sua assinatura</div>
						<h2 className="text-2xl font-bold">{plan?.name ?? 'Plano ativo'}</h2>
						{plan && (
							<div className="text-sm opacity-80 mt-1">
								R$ {plan.priceBRL}/mês
							</div>
						)}
					</div>
					<span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${currentStatus.className}`}>
						{currentStatus.icon}
						{currentStatus.label}
					</span>
				</div>
			</div>

			<div className="p-6 space-y-6">
				{/* Datas e validade */}
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{startDate && (
						<div className="flex items-start gap-3">
							<div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
								<Calendar className="w-4 h-4 text-neutral-500" />
							</div>
							<div>
								<div className="text-xs text-neutral-500 mb-0.5">Início da assinatura</div>
								<div className="text-sm font-medium text-neutral-900">{startDate}</div>
							</div>
						</div>
					)}

					{renewalDate ? (
						<div className="flex items-start gap-3">
							<div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
								<CheckCircle className="w-4 h-4 text-emerald-500" />
							</div>
							<div>
								<div className="text-xs text-neutral-500 mb-0.5">
									{status === 'canceled' ? 'Acesso até' : 'Próxima renovação'}
								</div>
								<div className="text-sm font-medium text-neutral-900">{renewalDate}</div>
							</div>
						</div>
					) : (
						<div className="flex items-start gap-3">
							<div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
								<Zap className="w-4 h-4 text-blue-500" />
							</div>
							<div>
								<div className="text-xs text-neutral-500 mb-0.5">Renovação</div>
								<div className="text-sm font-medium text-neutral-900">Acesso vitalício</div>
							</div>
						</div>
					)}

					<div className="flex items-start gap-3">
						<div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
							<CreditCard className="w-4 h-4 text-neutral-500" />
						</div>
						<div>
							<div className="text-xs text-neutral-500 mb-0.5">Método de pagamento</div>
							<div className="text-sm font-medium text-neutral-900">Mercado Pago</div>
						</div>
					</div>

					<div className="flex items-start gap-3">
						<div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
							<Shield className="w-4 h-4 text-neutral-500" />
						</div>
						<div>
							<div className="text-xs text-neutral-500 mb-0.5">Suporte</div>
							<div className="text-sm font-medium text-neutral-900">
								{planKey === 'clinic_pro' ? 'Dedicado + Onboarding' : planKey === 'profissional' || planKey === 'fundador' ? 'Prioritário' : 'Padrão'}
							</div>
						</div>
					</div>
				</div>

				{/* Recursos incluídos */}
				{plan && (
					<div>
						<div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-3">
							<Headphones className="w-4 h-4" />
							O que está incluído no seu plano
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{plan.features.map((feature, i) => (
								<div key={i} className="flex items-center gap-2 text-sm text-neutral-700">
									<Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
									{feature}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Ações */}
				{isActive && subscription?.stripe_subscription_id && (
					<div className="pt-2 border-t border-neutral-100">
						{cancelSuccess ? (
							<div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
								<CheckCircle className="w-4 h-4" />
								Assinatura cancelada. Recarregando...
							</div>
						) : (
							<button
								onClick={handleCancelSubscription}
								disabled={isCanceling}
								className="text-sm text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isCanceling ? 'Cancelando...' : 'Cancelar assinatura'}
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
