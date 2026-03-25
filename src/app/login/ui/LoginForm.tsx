'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm({
	hideSwitchLink,
	onSwitchMode,
}: {
	hideSwitchLink?: boolean
	onSwitchMode?: () => void
} = {}) {
	const router = useRouter()
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault()
		setError(null)
		setLoading(true)

		try {
			const supabase = createClient()
			const { error: signInError } = await supabase.auth.signInWithPassword({
				email,
				password,
			})

			if (signInError) {
				setError(signInError.message)
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
					autoComplete="current-password"
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-base text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200 sm:text-sm"
				/>
				<div className="flex items-center justify-end">
					<a
						href="#"
						className="text-sm font-medium text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline"
					>
						Esqueci minha senha
					</a>
				</div>
			</div>

			{error ? (
				<p className="auth-fade-up rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</p>
			) : null}

			<button
				type="submit"
				disabled={loading}
				className="w-full rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200/40 transition-transform active:scale-[0.99] disabled:opacity-60"
			>
				{loading ? 'Acessando…' : 'Acessar painel'}
			</button>

			{hideSwitchLink ? null : (
				<p className="text-sm text-neutral-600">
					Não tem conta?{' '}
					{onSwitchMode ? (
						<button
							type="button"
							onClick={onSwitchMode}
							className="text-neutral-900 underline"
						>
							Criar agora
						</button>
					) : (
						<Link className="text-neutral-900 underline" href="/signup">
							Criar agora
						</Link>
					)}
				</p>
			)}
		</form>
	)
}
