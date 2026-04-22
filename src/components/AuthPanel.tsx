'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, CalendarCheck2, Sparkles } from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import LoginForm from '@/app/login/ui/LoginForm'
import SignupForm from '@/app/signup/ui/SignupForm'

type Mode = 'login' | 'signup'

export default function AuthPanel({ mode }: { mode: Mode }) {
  const [isMounted, setIsMounted] = useState(false)
  const [activeMode, setActiveMode] = useState<Mode>(mode)

  useEffect(() => setIsMounted(true), [])
  useEffect(() => setActiveMode(mode), [mode])

  const isLogin = useMemo(() => activeMode === 'login', [activeMode])

  function selectMode(nextMode: Mode) {
    if (nextMode === activeMode) return
    setActiveMode(nextMode)
    const nextPath = nextMode === 'login' ? '/login' : '/signup'
    try {
      window.history.replaceState({}, '', nextPath)
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative min-h-screen overflow-y-auto lg:h-screen lg:overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-50">
      <div className="pointer-events-none absolute -left-24 -top-24 size-64 sm:size-80 rounded-full bg-sky-200/45 blur-3xl float-slow" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-72 sm:size-96 rounded-full bg-indigo-200/35 blur-3xl float" />
      <div className="pointer-events-none absolute left-1/2 top-8 size-48 -translate-x-1/2 rounded-full bg-sky-200/25 blur-3xl float-fast" />

      <div className="pointer-events-none absolute inset-0 auth-grid" aria-hidden />

      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-2 py-4 sm:px-3 sm:py-6 lg:h-screen lg:px-4 lg:py-4">
        <div className="grid w-full items-center gap-4 sm:gap-6 md:grid-cols-1 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)] lg:gap-4 lg:h-full">
          {/* Form - First on mobile, Left on desktop */}
          <section className="order-1 lg:order-1 lg:h-full lg:flex lg:items-center">
            <div
              className="group relative rounded-xl sm:rounded-2xl border border-white/60 bg-white/60 p-3 shadow-[0_20px_60px_-40px_rgba(2,6,23,0.45)] ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 hover:bg-white/70 sm:p-4 lg:p-5 w-full lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden"
              data-mounted={isMounted ? 'true' : 'false'}
            >
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/55 to-transparent" />
              <div className="pointer-events-none absolute inset-0 rounded-3xl auth-shimmer" />
              <div className="pointer-events-none absolute -inset-[2px] rounded-[26px] bg-gradient-to-r from-sky-200/0 via-sky-200/35 to-indigo-200/0 opacity-0 blur transition-opacity duration-500 group-hover:opacity-100" />

              <header className="relative">
                {/* Badge Premium */}
                <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/60 bg-gradient-to-r from-sky-50/80 to-indigo-50/60 px-2 py-0.5 shadow-sm backdrop-blur-sm">
                  <Sparkles className="size-2.5 text-sky-600" strokeWidth={2.5} />
                  <span className="text-[9px] font-semibold text-sky-700">Portal da clínica</span>
                </div>

                {/* Title & Brand */}
                <div className="mt-2 flex items-center gap-2">
                  <BrandMark />
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                      <span className="bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        Doctor Chat
                      </span>
                    </h1>
                  </div>
                </div>

                {/* Subtitle */}
                <p className="mt-1.5 text-[10px] sm:text-xs font-medium text-neutral-900">
                  Atenda pacientes no WhatsApp com bot + painel ao vivo.
                </p>
              </header>

              <nav className="relative mt-3 sm:mt-4">
                <div className="relative grid grid-cols-2 rounded-xl border border-neutral-200/80 bg-white/70 p-1">
                  <div
                    className={
                      "pointer-events-none absolute left-1 top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 shadow-sm transition-transform duration-300"
                    }
                    style={{
                      transform: isLogin ? 'translateX(0%)' : 'translateX(100%)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => selectMode('login')}
                    className={
                      "relative rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition-colors " +
                      (isLogin ? 'text-white' : 'text-neutral-900 hover:text-neutral-900')
                    }
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => selectMode('signup')}
                    className={
                      "relative rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition-colors " +
                      (!isLogin
                        ? 'text-white'
                        : 'text-neutral-900 hover:text-neutral-900')
                    }
                  >
                    Criar conta
                  </button>
                </div>
                <p className="mt-2 text-[10px] sm:text-xs text-neutral-500">
                  {isLogin
                    ? 'Entre com seu email e senha para acessar.'
                    : 'Crie sua conta e comece a receber atendimentos.'}
                </p>
              </nav>

              <section className="relative mt-3 sm:mt-4">
                <div
                  className={
                    "transition-all duration-300 ease-out " +
                    (isLogin
                      ? 'opacity-100 translate-y-0'
                      : 'pointer-events-none absolute inset-0 opacity-0 translate-y-2')
                  }
                  aria-hidden={!isLogin}
                >
                  <LoginForm hideSwitchLink onSwitchMode={() => selectMode('signup')} />
                </div>
                <div
                  className={
                    "transition-all duration-300 ease-out " +
                    (!isLogin
                      ? 'opacity-100 translate-y-0'
                      : 'pointer-events-none absolute inset-0 opacity-0 translate-y-2')
                  }
                  aria-hidden={isLogin}
                >
                  <SignupForm hideSwitchLink onSwitchMode={() => selectMode('login')} />
                </div>
              </section>

              <footer className="relative mt-3 sm:mt-4 text-center text-[10px] sm:text-xs text-neutral-500">
                © {new Date().getFullYear()} Doctor Chat
              </footer>
            </div>
          </section>

          {/* Showcase - Second on mobile, Right on desktop */}
          <section className="order-2 lg:order-2 lg:h-full lg:flex lg:items-center">
            <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/60 bg-gradient-to-br from-white/60 via-white/50 to-white/40 p-2 shadow-[0_20px_70px_-40px_rgba(14,165,233,0.35)] ring-1 ring-black/5 backdrop-blur-xl sm:p-3 lg:p-4 w-full lg:max-h-[calc(100vh-2rem)]">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50/40 via-transparent to-indigo-50/30" />
              <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-sky-300/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-12 size-48 rounded-full bg-indigo-300/15 blur-2xl" />

              <div className="relative">
                {/* Headline - Compact & Premium with Gradient */}
                <h2 className="max-w-lg text-sm font-bold leading-tight tracking-tight line-clamp-2 sm:text-base md:text-lg lg:text-xl">
                  <span className="bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Reduza no-show
                  </span>{' '}
                  <span className="text-neutral-900">
                    e automatize o WhatsApp da sua clínica.
                  </span>
                </h2>

                {/* 3 Features - Mini Cards Grid */}
                <div className="mt-1.5 sm:mt-2 grid grid-cols-1 gap-1.5 sm:gap-2 md:grid-cols-2 lg:grid-cols-3">
                  <div className="group relative overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1.5 sm:p-2 shadow-sm backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-md">
                    <div className="pointer-events-none absolute -right-8 -top-8 size-20 rounded-full bg-sky-400/10 blur-2xl transition-all group-hover:bg-sky-400/20" />
                    <div className="relative">
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <div className="flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 shadow-md shadow-sky-500/30">
                          <LayoutGrid className="size-2.5 sm:size-3 text-white" strokeWidth={2.5} />
                        </div>
                        <p className="font-bold text-neutral-900 text-[10px] sm:text-xs">Kanban</p>
                      </div>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] text-neutral-900 leading-relaxed">
                        Organize conversas por status e nunca perca o controle.
                      </p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1.5 sm:p-2 shadow-sm backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-md">
                    <div className="pointer-events-none absolute -right-8 -top-8 size-20 rounded-full bg-indigo-400/10 blur-2xl transition-all group-hover:bg-indigo-400/20" />
                    <div className="relative">
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <div className="flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md shadow-indigo-500/30">
                          <img src="/brand.png" alt="DoctorChatBot" className="size-2.5 sm:size-3 object-contain" />
                        </div>
                        <p className="font-bold text-neutral-900 text-[10px] sm:text-xs">Chatbot 24/7</p>
                      </div>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] text-neutral-900 leading-relaxed">
                        Responde, confirma e encaminha no automático.
                      </p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1.5 sm:p-2 shadow-sm backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-md md:col-span-2 lg:col-span-1">
                    <div className="pointer-events-none absolute -right-8 -top-8 size-20 rounded-full bg-purple-400/10 blur-2xl transition-all group-hover:bg-purple-400/20" />
                    <div className="relative">
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <div className="flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 shadow-md shadow-purple-500/30">
                          <CalendarCheck2 className="size-2.5 sm:size-3 text-white" strokeWidth={2.5} />
                        </div>
                        <p className="font-bold text-neutral-900 text-[10px] sm:text-xs">Anti no-show</p>
                      </div>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] text-neutral-900 leading-relaxed">
                        Lembretes automáticos que realmente funcionam.
                      </p>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Chat Simulation - List Style */}
                <div className="mt-1.5 sm:mt-2 rounded-lg border border-white/70 bg-gradient-to-br from-white/95 to-white/85 shadow-md backdrop-blur-md overflow-hidden">
                  {/* WhatsApp Header */}
                  <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 px-1.5 sm:px-2 py-1 sm:py-1.5">
                    <img 
                      src="https://i.pravatar.cc/150?img=47" 
                      alt="Maria Silva"
                      className="size-5 sm:size-6 rounded-full object-cover ring-2 ring-white/50"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-white">Maria Silva</p>
                      <p className="text-[7px] sm:text-[8px] text-sky-50">online</p>
                    </div>
                  </div>
                  
                  {/* Chat Messages List */}
                  <div className="bg-gradient-to-br from-sky-50/80 via-indigo-50/40 to-purple-50/60 p-1.5 sm:p-2 space-y-1">
                    {/* Message from bot with list */}
                    <div className="flex justify-end">
                      <div className="relative max-w-[85%]">
                        <div className="rounded-lg rounded-tr-sm bg-gradient-to-br from-sky-100 to-indigo-100 shadow-sm overflow-hidden border border-sky-200/50">
                          <div className="px-2 py-1">
                            <p className="text-[9px] text-neutral-800 leading-relaxed">
                              Qual dia você deseja agendar?
                            </p>
                          </div>
                          
                          {/* WhatsApp List Options */}
                          <div className="border-t border-sky-200/60 bg-white/60">
                            <div className="px-2 py-1 space-y-0.5">
                              <div className="flex items-center gap-1 py-0.5 px-1 rounded bg-white/80 border border-sky-200/60">
                                <div className="flex size-3 items-center justify-center rounded-full bg-sky-500 text-white text-[6px] font-bold">1</div>
                                <span className="text-[8px] text-neutral-900 font-medium">Segunda, 19/02</span>
                              </div>
                              <div className="flex items-center gap-1 py-0.5 px-1 rounded bg-white/80 border border-sky-200/60">
                                <div className="flex size-3 items-center justify-center rounded-full bg-sky-500 text-white text-[6px] font-bold">2</div>
                                <span className="text-[8px] text-neutral-900 font-medium">Quarta, 21/02</span>
                              </div>
                              <div className="flex items-center gap-1 py-0.5 px-1 rounded bg-white/80 border border-sky-200/60">
                                <div className="flex size-3 items-center justify-center rounded-full bg-sky-500 text-white text-[6px] font-bold">3</div>
                                <span className="text-[8px] text-neutral-900 font-medium">Sexta, 23/02</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-end gap-1 px-2 pb-1">
                            <span className="text-[7px] text-neutral-900">14:23</span>
                            <svg className="size-2.5 text-sky-600" fill="currentColor" viewBox="0 0 16 11">
                              <path d="M11.071.653a.5.5 0 00-.708.708L14.657 5.5l-4.294 4.139a.5.5 0 00.708.708l4.647-4.493a.5.5 0 000-.708L11.071.653zM6.424.653a.5.5 0 00-.707.708L10.01 5.5 5.717 9.639a.5.5 0 00.707.708l4.647-4.493a.5.5 0 000-.708L6.424.653z"/>
                            </svg>
                          </div>
                        </div>
                        <div className="absolute -right-1.5 top-0 w-0 h-0 border-t-[6px] border-t-sky-100 border-l-[6px] border-l-transparent"></div>
                      </div>
                    </div>

                    {/* Response from patient */}
                    <div className="flex justify-start">
                      <div className="relative max-w-[75%]">
                        <div className="rounded-lg rounded-tl-sm bg-white px-2 py-1 shadow-sm border border-neutral-200/50">
                          <p className="text-[9px] text-neutral-800 leading-relaxed">
                            Quarta, 21/02
                          </p>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <span className="text-[7px] text-neutral-500">14:24</span>
                          </div>
                        </div>
                        <div className="absolute -left-1.5 top-0 w-0 h-0 border-t-[6px] border-t-white border-r-[6px] border-r-transparent"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visual Mock - Responsive */}
                <div className="mt-1.5 sm:mt-2">
                  {/* Metrics at Top */}
                  <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                    <div className="group relative overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1 sm:p-1.5 shadow-sm backdrop-blur-sm transition-all hover:scale-[1.03]">
                      <div className="pointer-events-none absolute -right-6 -top-6 size-16 rounded-full bg-sky-400/10 blur-xl transition-all group-hover:bg-sky-400/20" />
                      <div className="relative">
                        <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-sky-600">Novas</p>
                        <p className="mt-0.5 text-sm sm:text-base lg:text-lg font-bold text-neutral-900">12</p>
                      </div>
                    </div>
                    <div className="group relative overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1 sm:p-1.5 shadow-sm backdrop-blur-sm transition-all hover:scale-[1.03]">
                      <div className="pointer-events-none absolute -right-6 -top-6 size-16 rounded-full bg-indigo-400/10 blur-xl transition-all group-hover:bg-indigo-400/20" />
                      <div className="relative">
                        <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-indigo-600">Agendadas</p>
                        <p className="mt-0.5 text-sm sm:text-base lg:text-lg font-bold text-neutral-900">5</p>
                      </div>
                    </div>
                    <div className="group relative overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1 sm:p-1.5 shadow-sm backdrop-blur-sm transition-all hover:scale-[1.03]">
                      <div className="pointer-events-none absolute -right-6 -top-6 size-16 rounded-full bg-purple-400/10 blur-xl transition-all group-hover:bg-purple-400/20" />
                      <div className="relative">
                        <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-purple-600">Aguardando</p>
                        <p className="mt-0.5 text-sm sm:text-base lg:text-lg font-bold text-neutral-900">3</p>
                      </div>
                    </div>
                  </div>

                  {/* Simplified Kanban */}
                  <div className="mt-1 sm:mt-1.5 rounded-lg border border-white/70 bg-gradient-to-br from-white/90 to-white/70 p-1.5 sm:p-2 shadow-md backdrop-blur-md">
                    <p className="text-[9px] sm:text-[10px] font-bold text-neutral-800">Painel de Atendimentos</p>
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-0.5">
                          <div className="size-1 rounded-full bg-sky-500"></div>
                          <p className="text-[7px] font-bold uppercase tracking-wider text-neutral-900">Novas</p>
                        </div>
                        <div className="rounded border border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-white p-1 shadow-sm">
                          <p className="text-[8px] font-semibold text-neutral-800">Ana Silva</p>
                          <p className="mt-0.5 text-[7px] text-neutral-900">Ortoped.</p>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-0.5">
                          <div className="size-1 rounded-full bg-indigo-500"></div>
                          <p className="text-[7px] font-bold uppercase tracking-wider text-neutral-900">Andamento</p>
                        </div>
                        <div className="rounded border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 to-white p-1 shadow-sm">
                          <p className="text-[8px] font-semibold text-neutral-800">Carla M.</p>
                          <p className="mt-0.5 text-[7px] text-neutral-900">Odonto</p>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-0.5">
                          <div className="size-1 rounded-full bg-purple-500"></div>
                          <p className="text-[7px] font-bold uppercase tracking-wider text-neutral-900">Agendadas</p>
                        </div>
                        <div className="rounded border border-purple-200/60 bg-gradient-to-br from-purple-50/80 to-white p-1 shadow-sm">
                          <p className="text-[8px] font-semibold text-neutral-800">Elisa A.</p>
                          <p className="mt-0.5 text-[7px] text-neutral-900">Derma</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

