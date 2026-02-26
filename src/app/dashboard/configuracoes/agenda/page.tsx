import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AgendaConfigPageClient from './AgendaConfigPageClient'

export const metadata = {
	title: 'Configurações da Agenda | Doctor Chat Bot',
	description: 'Configure a integração com Google Calendar',
}

export default async function AgendaConfigPage() {
	// Verificar autenticação
	const supabase = await createClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	return <AgendaConfigPageClient />
}
