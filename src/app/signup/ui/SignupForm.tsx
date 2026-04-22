'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignupForm({
	hideSwitchLink,
	onSwitchMode,
}: {
	hideSwitchLink?: boolean
	onSwitchMode?: () => void
} = {}) {
	const router = useRouter()
	const [clinicName, setClinicName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault()
		setError(null)
		setNotice(null)
		setLoading(true)

		try {
			const supabase = createClient()
			const { data, error: signUpError } = await supabase.auth.signUp({
				email,
				password,
				options: {
					data: {
						clinic_name: clinicName,
					},
				},
			})

			if (signUpError) {
				setError(signUpError.message)
				return
			}

			// If email confirmations are enabled, session can be null.
			if (!data.session) {
				setNotice('Conta criada. Verifique seu email (se necessário) e faça login.')
				return
			}

			window.location.href = '/dashboard'
		} finally {
			setLoading(false)
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="clinicName">
					Nome da clínica
				</label>
				<input
					id="clinicName"
					type="text"
					required
					value={clinicName}
					onChange={(e) => setClinicName(e.target.value)}
					className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-base text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200 sm:text-sm"
					placeholder="Ex.: Clínica São José"
				/>
				<p className="text-xs text-neutral-500">
					Usaremos esse nome para configurar seu painel.
				</p>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="email">
					Email
				</label>
				<input
					id="email"
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-base text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200 sm:text-sm"
				/>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium" htmlFor="password">
					Senha
				</label>
				<input
					id="password"
					type="password"
					autoComplete="new-password"
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-base text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200 sm:text-sm"
				/>
			</div>

			{error ? (
				<p className="auth-fade-up rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</p>
			) : null}

			{notice ? (
				<p className="auth-fade-up rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
					{notice}
				</p>
			) : null}

			<button
				type="submit"
				disabled={loading}
				className="w-full rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200/40 transition-transform active:scale-[0.99] disabled:opacity-60"
			>
				{loading ? 'Criando…' : 'Criar minha clínica'}
			</button>

			{hideSwitchLink ? null : (
				<p className="text-sm text-neutral-900">
					Já tem conta?{' '}
					{onSwitchMode ? (
						<button
							type="button"
							onClick={onSwitchMode}
							className="text-neutral-900 underline"
						>
							Entrar
						</button>
					) : (
						<Link className="text-neutral-900 underline" href="/login">
							Entrar
						</Link>
					)}
				</p>
			)}
		</form>
	)
}
