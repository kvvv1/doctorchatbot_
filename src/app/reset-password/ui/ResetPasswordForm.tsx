'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import BrandMark from '@/components/BrandMark'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

type View = 'loading' | 'form' | 'success' | 'invalid'

export default function ResetPasswordForm() {
  const router = useRouter()
  const [view, setView] = useState<View>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // onAuthStateChange fires immediately with the current session,
    // and fires again with PASSWORD_RECOVERY when the user arrives via the reset link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('form')
      } else if (event === 'SIGNED_IN') {
        // already has a valid session; treat same as recovery
        setView('form')
      }
    })

    // Fallback: if there's already an active session when the page loads
    // (e.g. Supabase already exchanged the token before our listener attached)
    supabase.auth.getSession().then(({ data }: { data: { session: object | null } }) => {
      if (data.session) {
        setView('form')
      } else {
        // No session and no PASSWORD_RECOVERY event yet.
        // Give it 4 s for the hash exchange, then show invalid.
        const timer = setTimeout(() => {
          setView((prev) => (prev === 'loading' ? 'invalid' : prev))
        }, 4000)
        return () => clearTimeout(timer)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setView('success')
      setTimeout(() => router.replace('/dashboard'), 2500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 size-64 rounded-full bg-sky-200/45 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-72 rounded-full bg-indigo-200/35 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl border border-white/60 bg-white/70 p-6 shadow-[0_20px_60px_-40px_rgba(2,6,23,0.45)] ring-1 ring-black/5 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/55 to-transparent" />

        <div className="relative">
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <BrandMark />
            <h1 className="text-lg font-bold bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Doctor Chat
            </h1>
          </div>

          {/* Loading */}
          {view === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8 text-neutral-500">
              <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
              <p className="text-sm">Verificando link de recuperação…</p>
            </div>
          )}

          {/* Invalid / expired link */}
          {view === 'invalid' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Link inválido ou expirado</p>
                  <p className="text-sm text-red-700 mt-1">
                    Solicite um novo link pelo formulário de login.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.replace('/login')}
                className="w-full rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200/40 transition-transform active:scale-[0.99]"
              >
                Voltar ao login
              </button>
            </div>
          )}

          {/* Success */}
          {view === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="font-semibold text-neutral-900">Senha redefinida!</p>
              <p className="text-sm text-neutral-500">Redirecionando para o painel…</p>
            </div>
          )}

          {/* Reset form */}
          {view === 'form' && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-900 mb-0.5">Redefinir senha</h2>
                <p className="text-xs text-neutral-500">Digite sua nova senha abaixo.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-900" htmlFor="new-password">
                  Nova senha
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-sm text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-900" htmlFor="confirm-password">
                  Confirmar nova senha
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-sm text-neutral-900 shadow-sm outline-none ring-1 ring-transparent transition focus:border-neutral-900 focus:ring-sky-200"
                />
              </div>

              {error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200/40 transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
