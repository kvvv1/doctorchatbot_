import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import ConfiguracoesPageClient from './ConfiguracoesPageClient'
import { Metadata } from 'next'
import { checkSubscription } from '@/lib/services/subscriptionService'
import { hasFeatureAccess, PlanFeature } from '@/lib/services/planFeatures'
import { getBotSettings } from '@/lib/services/botSettingsService'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
	title: 'Configurações',
	description: 'Configure sua clínica e preferências',
}

export const dynamic = 'force-dynamic'

export default async function ConfiguracoesPage() {
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const { clinic } = session

	const subscription = await checkSubscription(clinic.id)
	const botSettings = await getBotSettings(clinic.id)
	const supabase = createAdminClient()
	const { data: appointmentSettings } = await supabase
		.from('appointment_settings')
		.select('default_duration_minutes')
		.eq('clinic_id', clinic.id)
		.maybeSingle()
	const initialDefaultDurationMinutes = appointmentSettings?.default_duration_minutes ?? 30
	const hasCustomFlows = hasFeatureAccess(
		subscription.planKey,
		PlanFeature.BOT_CUSTOM_FLOWS
	)

	return (
		<ConfiguracoesPageClient 
			initialClinicName={clinic.name} 
			clinicId={clinic.id}
			initialBotSettings={botSettings}
			initialDefaultDurationMinutes={initialDefaultDurationMinutes}
			planKey={subscription.planKey}
			hasCustomFlows={hasCustomFlows}
		/>
	)
}
