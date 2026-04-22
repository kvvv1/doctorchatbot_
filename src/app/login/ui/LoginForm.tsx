'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type View = 'login' | 'forgot' | 'forgot-sent'

export default function LoginForm({
	hideSwitchLink,
	onSwitchMode,
}: {
	hideSwitchLink?: boolean
	onSwitchMode?: () => void
} = {}) {
	const router = useRouter()
	const [view, setView] = useState<View>('login')
	const [email, setEmail] = useState('')
	const [forgotEmail, setForgotEmail] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault()
		setError(null)
		setLoading(true)

		try {
			const supabase = createClient()
			const { data, error: signInError } = await supabase.auth.signInWithPassword({
				email,
				password,
			})

			if (signInError) {
				setError(signInError.message)
				return
			}

			if (!data.session) {
				setError('Sessão não iniciada. Tente novamente em instantes.')
				return
			}

			router.replace('/dashboard')
			router.refresh()
		} finally {
			setLoading(false)
		}
	}

	async function onForgotSubmit(event: React.FormEvent) {
		event.preventDefault()
		setError(null)
		setLoading(true)

		try {
			const supabase = createClient()
			const redirectTo = `${window.location.origin}/reset-password`
			const { error: resetError } = await supabase.auth.resetPasswordForEmail(
				forgotEmail,
				{ redirectTo },
			)

			if (resetError) {
				setError(resetError.message)
				return
			}

			setView('forgot-sent')
		} finally {
			setLoading(false)
		}
	}

	// ── Forgot-sent (success) ──────────────────────────────────────────────────
	if (view === 'forgot-sent') {
		return (
			<div className="space-y-4">
				<div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
					<p className="font-semibold mb-1">Email enviado!</p>
					<p>Verifique sua caixa de entrada em <span className="font-medium">{forgotEmail}</span> e clique no link para redefinir sua senha.</p>
				</div>
				<button
					type="button"
					onClick={() => { setView('login'); setError(null) }}
					className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
				>
					Voltar ao login
				</button>
			</div>
		)
	}

	// ── Forgot password form ───────────────────────────────────────────────────
	if (view === 'forgot') {
		return (
			<form onSubmit={onForgotSubmit} className="space-y-4">
				<div>
					<p className="text-sm text-neutral-900 mb-3">
						Digite seu email e enviaremos um link para redefinir sua senha.
					</p>
					<label className="text-sm font-medium" htmlFor="forgot-email">
						Email
					</label>
					<input
						id="forgot-email"
						type="email"
						autoComplete="email"
						required
						value={forgotEmail}
						onChange={(e) => setForgotEmail(e.target.value)}
						className="mt-1.5 w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-base text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200 sm:text-sm"
					/>
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
					{loading ? 'Enviando…' : 'Enviar link de recuperação'}
				</button>

				<button
					type="button"
					onClick={() => { setView('login'); setError(null) }}
					className="w-full text-center text-sm text-neutral-500 hover:text-neutral-900 underline-offset-4 hover:underline"
				>
					Voltar ao login
				</button>
			</form>
		)
	}

	// ── Login form ─────────────────────────────────────────────────────────────
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
					<button
						type="button"
						onClick={() => { setForgotEmail(email); setView('forgot'); setError(null) }}
						className="text-sm font-medium text-neutral-900 underline-offset-4 hover:text-neutral-900 hover:underline"
					>
						Esqueci minha senha
					</button>
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
				<p className="text-sm text-neutral-900">
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
