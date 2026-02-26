'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
	const router = useRouter()
	const [loading, setLoading] = useState(false)

	async function onSignOut() {
		setLoading(true)
		try {
			const supabase = createClient()
			await supabase.auth.signOut()
			router.replace('/login')
			router.refresh()
		} finally {
			setLoading(false)
		}
	}

	return (
		<button
			onClick={onSignOut}
			disabled={loading}
			className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition-transform active:scale-[0.99] disabled:opacity-60 sm:w-auto"
		>
			{loading ? 'Saindo…' : 'Sair'}
		</button>
	)
}
