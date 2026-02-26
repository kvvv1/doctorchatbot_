import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthPanel from '@/components/AuthPanel'
import { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Login',
	description: 'Entre no seu painel de atendimento',
}

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
	const supabase = await createClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()

	if (user) redirect('/dashboard')

	return <AuthPanel mode="login" />
}
