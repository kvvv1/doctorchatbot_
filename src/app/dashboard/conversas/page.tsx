import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { getBotSettings } from '@/lib/services/botSettingsService'
import ConversasPageClient from './ConversasPageClient'
import { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Conversas',
	description: 'Acompanhe as conversas com seus pacientes',
}

export const dynamic = 'force-dynamic'

export default async function ConversasPage() {
	const session = await getSessionProfile()
	if (!session) redirect('/login')

	const botSettings = await getBotSettings(session.clinic.id)

	return (
		<ConversasPageClient
			clinicId={session.clinic.id}
			defaultTakeoverMessage={botSettings?.message_takeover ?? 'Olá! Sou um atendente da clínica e estou aqui para te ajudar. 😊'}
			takeoverMessageEnabled={botSettings?.takeover_message_enabled ?? true}
		/>
	)
}
