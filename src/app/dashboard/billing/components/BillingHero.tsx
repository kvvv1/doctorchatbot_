'use client'

interface BillingHeroProps {
	isActive: boolean
}

export default function BillingHero({ isActive }: BillingHeroProps) {
	return (
		<div>
			{!isActive && (
				<div className="mb-4">
					<div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-700 rounded-lg">
						<span className="text-xs font-medium">
							Assinatura inativa
						</span>
					</div>
				</div>
			)}
			
			<h1 className="text-4xl font-bold text-neutral-900 mb-3 tracking-tight">
				Transforme o WhatsApp da sua clínica em um atendimento inteligente
			</h1>
			<p className="text-lg text-neutral-600 max-w-2xl leading-relaxed">
				Automatize agendamentos, reduza no-show e organize conversas em um painel único. Escale sua clínica sem aumentar custos operacionais.
			</p>
		</div>
	)
}
