import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createClient } from '@/lib/supabase/server'
import DashboardLayoutClient from './components/DashboardLayoutClient'
import { DEFAULT_WORK_SCHEDULE } from '@/lib/utils/dateHelpers'
import { checkSubscription } from '@/lib/services/subscriptionService'

export const dynamic = 'force-dynamic'

type WhatsAppStatus = 'connected' | 'disconnected' | 'connecting'
type BotStatus = 'active' | 'paused'

async function getSystemStatus(clinicId: string) {
	const supabase = await createClient()

	// Buscar instância do WhatsApp
	const { data: whatsappInstance } = await supabase
		.from('whatsapp_instances')
		.select('status')
		.eq('clinic_id', clinicId)
		.eq('provider', 'zapi')
		.single()

	// Buscar configurações do bot
	const { data: botSettings } = await supabase
		.from('bot_settings')
		.select('bot_default_enabled')
		.eq('clinic_id', clinicId)
		.single()

	return {
		whatsappStatus: (whatsappInstance?.status || 'disconnected') as WhatsAppStatus,
		botStatus: (botSettings?.bot_default_enabled ? 'active' : 'paused') as BotStatus,
	}
}

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const { clinic } = session

	// Check subscription status
	const subscriptionCheck = await checkSubscription(clinic.id)

	// TODO: Buscar workSchedule do banco quando estiver configurado
	// Por enquanto usa o padrão: seg-sex 08:00-18:00
	const workSchedule = DEFAULT_WORK_SCHEDULE

	const systemStatus = await getSystemStatus(clinic.id)

	return (
		<DashboardLayoutClient
			clinicName={clinic.name}
			workSchedule={workSchedule}
			whatsappStatus={systemStatus.whatsappStatus}
			botStatus={systemStatus.botStatus}
			subscriptionStatus={subscriptionCheck.status}
			isSubscriptionActive={subscriptionCheck.isActive}
		>
			{children}
		</DashboardLayoutClient>
	)
}
