'use client'

import { Shield, CreditCard, RefreshCcw, FileText } from 'lucide-react'

const trustItems = [
	{
		icon: Shield,
		title: 'Pagamento seguro',
		description: 'Criptografia via Stripe',
	},
	{
		icon: RefreshCcw,
		title: 'Cancele quando quiser',
		description: 'Sem complicações',
	},
	{
		icon: CreditCard,
		title: 'Sem fidelidade',
		description: 'Flexibilidade total',
	},
	{
		icon: FileText,
		title: 'Nota fiscal',
		description: 'Sempre disponível',
	},
]

export default function BillingTrustSection() {
	return (
		<div className="bg-neutral-50 border border-neutral-200 rounded-xl px-8 py-10">
			<div className="grid grid-cols-2 md:grid-cols-4 gap-8">
				{trustItems.map((item, index) => {
					const Icon = item.icon
					return (
						<div key={index} className="text-center">
							<div className="inline-flex items-center justify-center w-10 h-10 bg-white border border-neutral-200 rounded-lg mb-3">
								<Icon className="w-5 h-5 text-neutral-900" />
							</div>
							<div className="text-sm font-semibold text-neutral-900 mb-1">
								{item.title}
							</div>
							<div className="text-xs text-neutral-900">{item.description}</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
