'use client'

import { Subscription } from '@/lib/types/database'
import { SubscriptionCheck } from '@/lib/services/subscriptionService'
import PlanCard from './components/PlanCard'
import BillingTrustSection from './components/BillingTrustSection'
import { getMainPlans, PLANS } from '@/config/plans'
import { CheckCircle, XCircle, Clock, AlertTriangle, CreditCard, Calendar, Check } from 'lucide-react'
import { useState } from 'react'

interface BillingPageClientProps {
	subscription: Subscription | null
	subscriptionCheck: SubscriptionCheck
	clinicId: string
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
	active: { label: 'Ativa', icon: <CheckCircle className="w-3.5 h-3.5" />, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
	trialing: { label: 'Em teste', icon: <Clock className="w-3.5 h-3.5" />, className: 'text-blue-700 bg-blue-50 border-blue-200' },
	past_due: { label: 'Pagamento pendente', icon: <AlertTriangle className="w-3.5 h-3.5" />, className: 'text-amber-700 bg-amber-50 border-amber-200' },
	canceled: { label: 'Cancelada', icon: <XCircle className="w-3.5 h-3.5" />, className: 'text-red-700 bg-red-50 border-red-200' },
	inactive: { label: 'Inativa', icon: <XCircle className="w-3.5 h-3.5" />, className: 'text-neutral-900 bg-neutral-100 border-neutral-300' },
}

function formatDate(d: string | null) {
	if (!d) return null
	return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function BillingPageClient({ subscription, subscriptionCheck }: BillingPageClientProps) {
	const mainPlans = getMainPlans()
	const [canceling, setCanceling] = useState(false)

	const { planKey, isActive, status, currentPeriodEnd } = subscriptionCheck
	const plan = planKey ? PLANS[planKey] : null
	const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive

	const handleCancel = async () => {
		if (!window.confirm('Tem certeza que deseja cancelar? O acesso permanece ativo até o fim do período.')) return
		setCanceling(true)
		try {
			const res = await fetch('/api/mercadopago/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'cancel' }),
			})
			if (res.ok) window.location.reload()
			else alert('Erro ao cancelar. Entre em contato com o suporte.')
		} catch {
			alert('Erro ao cancelar. Entre em contato com o suporte.')
		} finally {
			setCanceling(false)
		}
	}

	return (
		<div className="min-h-screen bg-neutral-50">
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

				{/* Título */}
				<div className="mb-8">
					<h1 className="text-2xl font-bold text-neutral-900">Assinatura</h1>
					<p className="text-sm text-neutral-500 mt-1">Seu plano atual e opções de upgrade.</p>
				</div>

				{/* ── Informações da assinatura atual ── */}
				<div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-10">
					<div className="flex flex-wrap items-start justify-between gap-4 mb-6">
						<div>
							<div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Plano atual</div>
							<div className="text-xl font-bold text-neutral-900">
								{plan ? plan.name : 'Nenhum plano ativo'}
							</div>
							{plan && (
								<div className="text-sm text-neutral-500 mt-0.5">R$ {plan.priceBRL}/mês</div>
							)}
						</div>
						<span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusCfg.className}`}>
							{statusCfg.icon}
							{statusCfg.label}
						</span>
					</div>

					<div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm mb-6">
						{formatDate(subscription?.created_at ?? null) && (
							<div>
								<div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-0.5">
									<Calendar className="w-3.5 h-3.5" /> Início
								</div>
								<div className="font-medium text-neutral-800">{formatDate(subscription?.created_at ?? null)}</div>
							</div>
						)}
						<div>
							<div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-0.5">
								<Calendar className="w-3.5 h-3.5" />
								{status === 'canceled' ? 'Acesso até' : 'Próxima renovação'}
							</div>
							<div className="font-medium text-neutral-800">
								{formatDate(currentPeriodEnd) ?? 'Sem data definida'}
							</div>
						</div>
						<div>
							<div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-0.5">
								<CreditCard className="w-3.5 h-3.5" /> Pagamento
							</div>
							<div className="font-medium text-neutral-800">Mercado Pago</div>
						</div>
					</div>

					{/* Recursos do plano */}
					{plan && (
						<div className="border-t border-neutral-100 pt-5">
							<div className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Incluído no seu plano</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6">
								{plan.features.map((f, i) => (
									<div key={i} className="flex items-center gap-2 text-sm text-neutral-900">
										<Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
										{f}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Cancelar */}
				{isActive && subscription?.status !== 'canceled' && (
						<div className="mt-5 pt-4 border-t border-neutral-100">
							<button
								onClick={handleCancel}
								disabled={canceling}
								className="text-sm text-red-500 hover:text-red-600 hover:underline disabled:opacity-50"
							>
								{canceling ? 'Cancelando...' : 'Cancelar assinatura'}
							</button>
						</div>
					)}
				</div>

				{/* ── Planos disponíveis ── */}
				<div>
					<div className="mb-6">
						<h2 className="text-lg font-semibold text-neutral-900">
							{isActive ? 'Alterar plano' : 'Escolha seu plano'}
						</h2>
						<p className="text-sm text-neutral-500 mt-0.5">Transparente, sem surpresas. Cancele quando quiser.</p>
					</div>

					<div className="grid md:grid-cols-3 gap-5 mb-8">
						{mainPlans.map((p) => (
							<PlanCard key={p.key} plan={p} isActive={isActive} />
						))}
					</div>
				</div>

				<div className="mt-16">
					<BillingTrustSection />
				</div>
			</div>
		</div>
	)
}

