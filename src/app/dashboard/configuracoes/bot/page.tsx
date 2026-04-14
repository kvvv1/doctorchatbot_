import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { getBotSettingsForCurrentUser } from '@/lib/services/botSettingsService'
import { checkSubscription } from '@/lib/services/subscriptionService'
import { hasFeatureAccess, PlanFeature } from '@/lib/services/planFeatures'
import UpgradePrompt from '../../components/UpgradePrompt'
import FeatureGate from '../../components/FeatureGate'
import BotConfigPageClient from './BotConfigPageClient'
import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
	title: 'Configurações do Bot',
	description: 'Configure o comportamento do chatbot',
}

export const dynamic = 'force-dynamic'

export default async function BotConfigPage() {
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const { clinic } = session

	// Check bot access
	const subscription = await checkSubscription(clinic.id)
	const hasBotAccess = hasFeatureAccess(
		subscription.planKey,
		PlanFeature.BOT_ENABLED
	)

	// If no bot access at all, redirect
	if (!hasBotAccess) {
		return (
			<div className="p-6">
				<div className="mb-8">
					<h1 className="text-2xl font-bold text-neutral-900">Configurações do Bot</h1>
					<p className="mt-1 text-sm text-neutral-600">
						Configure o comportamento do chatbot
					</p>
				</div>

				<UpgradePrompt
					featureName="Chatbot Inteligente com IA"
					requiredPlans={['Essencial', 'Profissional', 'Clinic Pro', 'Fundador']}
					currentPlan={subscription.planKey}
				/>
			</div>
		)
	}

	// Get or create bot settings for this clinic
	const botSettings = await getBotSettingsForCurrentUser()

	if (!botSettings) {
		return (
			<div className="p-6">
				<p className="text-red-500">Erro ao carregar configurações do bot.</p>
			</div>
		)
	}

	// Check advanced features
	const hasCustomFlows = hasFeatureAccess(
		subscription.planKey,
		PlanFeature.BOT_CUSTOM_FLOWS
	)

	// Check if GestaoDS is connected
	const supabase = createAdminClient()
	const { data: gestaoDSIntegration } = await supabase
		.from('clinic_integrations')
		.select('id')
		.eq('clinic_id', clinic.id)
		.eq('provider', 'gestaods')
		.eq('is_connected', true)
		.maybeSingle()
	const hasGestaoDS = !!gestaoDSIntegration

	return (
		<BotConfigPageClient 
			clinicId={clinic.id} 
			initialSettings={botSettings}
			planKey={subscription.planKey}
			hasCustomFlows={hasCustomFlows}
			hasGestaoDS={hasGestaoDS}
		/>
	)
}
