import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { checkSubscription } from '@/lib/services/subscriptionService'
import { hasFeatureAccess, PlanFeature } from '@/lib/services/planFeatures'
import UpgradePrompt from '../../components/UpgradePrompt'
import AgendaConfigPageClient from './AgendaConfigPageClient'

export const metadata = {
	title: 'Configurações da Agenda | Doctor Chat Bot',
	description: 'Configure a integração com Google Calendar',
}

export default async function AgendaConfigPage() {
	// Verificar autenticação
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const subscription = await checkSubscription(session.clinic.id)
	const hasCalendarIntegrationAccess =
		subscription.isActive &&
		hasFeatureAccess(subscription.planKey, PlanFeature.CALENDAR_INTEGRATION)

	if (!hasCalendarIntegrationAccess) {
		return (
			<div className="p-6">
				<div className="max-w-3xl mx-auto space-y-6">
					<UpgradePrompt
						featureName="Integrações externas de agenda"
						requiredPlans={['Profissional', 'Clinic Pro']}
						currentPlan={subscription.planKey}
					/>
					<div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
						A agenda manual e os agendamentos pelo DoctorChatBot continuam
						disponíveis no seu plano. Esta tela é exclusiva para integrações
						externas, como Google Calendar.
					</div>
				</div>
			</div>
		)
	}

	return <AgendaConfigPageClient />
}
