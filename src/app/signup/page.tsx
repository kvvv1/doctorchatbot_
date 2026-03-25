import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthPanel from '@/components/AuthPanel'
import { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Criar Conta',
	description: 'Crie sua conta e comece a usar o chatbot',
}

export const dynamic = 'force-dynamic'

export default async function SignupPage() {
	return <AuthPanel mode="signup" />
}
