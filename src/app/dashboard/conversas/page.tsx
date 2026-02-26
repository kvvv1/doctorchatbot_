import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
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

	return <ConversasPageClient clinicId={session.clinic.id} />
}
