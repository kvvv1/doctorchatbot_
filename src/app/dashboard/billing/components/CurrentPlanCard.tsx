'use client'

import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { PlanKey } from '@/lib/types/database'

interface CurrentPlanCardProps {
	isActive: boolean
	status: string
	currentPeriodEnd: string | null
	hasStripeCustomer: boolean
	planKey: PlanKey | null
}

export default function CurrentPlanCard({
	isActive,
	status,
	currentPeriodEnd,
	hasStripeCustomer,
	planKey,
}: CurrentPlanCardProps) {
	const [isCreatingPortal, setIsCreatingPortal] = useState(false)

	const handleManageSubscription = async () => {
		setIsCreatingPortal(true)
		try {
			const response = await fetch('/api/stripe/create-portal-session', {
				method: 'POST',
			})

			if (response.ok) {
				const data = await response.json()
				window.location.href = data.url
			} else {
				alert('Erro ao abrir portal de pagamento')
			}
		} catch (error) {
			console.error('Error creating portal session:', error)
			alert('Erro ao abrir portal de pagamento')
		} finally {
			setIsCreatingPortal(false)
		}
	}

	const formatDate = (dateString: string | null) => {
		if (!dateString) return 'N/A'
		return new Date(dateString).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		})
	}

	const getStatusDisplay = () => {
		if (isActive) {
			return {
				text: 'Ativo',
				className: 'bg-blue-50 text-blue-700 border-blue-200',
			}
		}
		return {
			text: 'Inativo',
			className: 'bg-neutral-100 text-neutral-700 border-neutral-300',
		}
	}

	const getPlanDisplayName = (key: PlanKey | null): string => {
		if (!key) return 'Nenhum plano'
		const names: Record<PlanKey, string> = {
			essencial: 'Essencial',
			profissional: 'Profissional',
			clinic_pro: 'Clinic Pro',
			fundador: 'Fundador',
		}
		return names[key] || key
	}

	const statusDisplay = getStatusDisplay()

	return (
		<div className="bg-white border border-neutral-200 rounded-xl p-6 h-fit">
			<div className="flex items-center gap-2 text-sm text-neutral-500 mb-4">
				<CreditCard className="w-4 h-4" />
				Plano atual
			</div>

			<div className="space-y-4">
				<div>
					<div className="text-xs text-neutral-500 mb-1">Status</div>
					<span
						className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${statusDisplay.className}`}
					>
						{statusDisplay.text}
					</span>
				</div>

				<div>
					<div className="text-xs text-neutral-500 mb-1">Plano</div>
					<div className="text-sm font-semibold text-neutral-900">{getPlanDisplayName(planKey)}</div>
				</div>

				{currentPeriodEnd && (
					<div>
						<div className="text-xs text-neutral-500 mb-1">Renovação</div>
						<div className="text-sm font-medium text-neutral-900">
							{formatDate(currentPeriodEnd)}
						</div>
					</div>
				)}

				{isActive && hasStripeCustomer && (
					<button
						onClick={handleManageSubscription}
						disabled={isCreatingPortal}
						className="w-full mt-2 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isCreatingPortal ? 'Abrindo...' : 'Gerenciar assinatura'}
					</button>
				)}
			</div>
		</div>
	)
}
