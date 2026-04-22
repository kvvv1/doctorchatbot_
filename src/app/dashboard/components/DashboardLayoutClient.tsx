'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import type { WorkSchedule } from '@/lib/utils/dateHelpers'
import Link from 'next/link'
import type { SubscriptionStatus } from '@/lib/types/database'

export type WhatsAppStatus = 'connected' | 'disconnected' | 'connecting'
export type BotStatus = 'active' | 'paused'

interface DashboardLayoutClientProps {
	clinicName: string
	workSchedule?: WorkSchedule
	whatsappStatus: WhatsAppStatus
	botStatus: BotStatus
	subscriptionStatus: SubscriptionStatus
	isSubscriptionActive: boolean
	children: React.ReactNode
}

export default function DashboardLayoutClient({
	clinicName,
	workSchedule,
	whatsappStatus: initialWhatsappStatus,
	botStatus: initialBotStatus,
	subscriptionStatus,
	isSubscriptionActive,
	children,
}: DashboardLayoutClientProps) {
	const pathname = usePathname()
	const isConversas = pathname.startsWith('/dashboard/conversas')
	const isFullScreen = isConversas || pathname.startsWith('/dashboard/agenda')
	const [isMobileOpen, setIsMobileOpen] = useState(false)
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
	const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>(initialWhatsappStatus)
	const [botStatus, setBotStatus] = useState<BotStatus>(initialBotStatus)

	// Carregar preferência do localStorage
	useEffect(() => {
		const savedCollapsed = localStorage.getItem('sidebarCollapsed')
		if (savedCollapsed !== null) {
			setIsSidebarCollapsed(savedCollapsed === 'true')
		}
	}, [])

	// Buscar status real do WhatsApp periodicamente
	useEffect(() => {
		const fetchWhatsAppStatus = async () => {
			if (document.hidden) return
			try {
				const response = await fetch('/api/zapi/status', {
					method: 'GET',
					cache: 'no-store',
				})

				if (response.ok) {
					const data = await response.json()
					// Se não tem instância ou está pending, considera desconectado
					if (data.pending) {
						setWhatsappStatus('disconnected')
					} else {
						setWhatsappStatus(data.status as WhatsAppStatus)
					}
				} else if (response.status === 404) {
					// Instância não configurada
					setWhatsappStatus('disconnected')
				}
			} catch (error) {
				// Em caso de erro (servidor offline, etc), mantém o status atual
			}
		}

		// Busca inicial
		fetchWhatsAppStatus()

		const interval = setInterval(fetchWhatsAppStatus, 30000)
		document.addEventListener('visibilitychange', fetchWhatsAppStatus)

		return () => {
			clearInterval(interval)
			document.removeEventListener('visibilitychange', fetchWhatsAppStatus)
		}
	}, [])

	// Buscar status real do Bot periodicamente
	useEffect(() => {
		const fetchBotStatus = async () => {
			if (document.hidden) return
			try {
				const response = await fetch('/api/bot/status', {
					method: 'GET',
					cache: 'no-store',
				})

				if (response.ok) {
					const data = await response.json()
					setBotStatus(data.status as BotStatus)
				}
			} catch (error) {
				// Em caso de erro, mantém o status atual
			}
		}

		// Busca inicial
		fetchBotStatus()

		const interval = setInterval(fetchBotStatus, 30000)
		document.addEventListener('visibilitychange', fetchBotStatus)

		return () => {
			clearInterval(interval)
			document.removeEventListener('visibilitychange', fetchBotStatus)
		}
	}, [])

	// Salvar preferência no localStorage
	const toggleSidebar = () => {
		setIsSidebarCollapsed((prev) => {
			const newValue = !prev
			localStorage.setItem('sidebarCollapsed', String(newValue))
			return newValue
		})
	}

	return (
		<div
			className="flex overflow-hidden bg-neutral-50"
			style={{ height: 'calc(100dvh - env(safe-area-inset-top, 0px))' }}
		>
			{/* Subscription Banner no topo absoluto na página de conversas */}
			{isFullScreen ? (
				<div className="flex h-full w-full overflow-hidden">
					{!isSubscriptionActive && (
						<div className="absolute top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between">
							<p className="text-xs font-medium text-yellow-800">
								{subscriptionStatus === 'past_due' && 'Pagamento pendente — '}
								{subscriptionStatus === 'canceled' && 'Assinatura cancelada — '}
								{subscriptionStatus === 'inactive' && 'Assinatura inativa — '}
							</p>
							<Link href="/dashboard/billing" className="text-xs font-semibold text-yellow-800 underline">Regularizar →</Link>
						</div>
					)}
					{children}
				</div>
			) : (
				<>
					<Sidebar
						isMobileOpen={isMobileOpen}
						isCollapsed={isSidebarCollapsed}
						onClose={() => setIsMobileOpen(false)}
					/>
					<div className="flex flex-1 flex-col overflow-hidden">
						<Topbar
							clinicName={clinicName}
							workSchedule={workSchedule}
							whatsappStatus={whatsappStatus}
							botStatus={botStatus}
							isSidebarCollapsed={isSidebarCollapsed}
							onMenuClick={() => setIsMobileOpen(true)}
							onToggleSidebar={toggleSidebar}
						/>

						{/* Subscription Banner */}
						{!isSubscriptionActive && (
							<div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
								<div className="flex items-center justify-between max-w-7xl mx-auto">
									<div className="flex items-center">
										<svg className="h-5 w-5 text-yellow-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
										</svg>
										<div>
											<p className="text-sm font-medium text-yellow-800">
												{subscriptionStatus === 'past_due' && 'Pagamento pendente'}
												{subscriptionStatus === 'canceled' && 'Assinatura cancelada'}
												{subscriptionStatus === 'inactive' && 'Assinatura inativa'}
											</p>
											<p className="text-xs text-yellow-700">
												{subscriptionStatus === 'past_due' && 'Regularize seu pagamento para continuar usando os recursos.'}
												{subscriptionStatus === 'canceled' && 'Reative sua assinatura para continuar usando os recursos.'}
												{subscriptionStatus === 'inactive' && 'Assine agora para desbloquear todos os recursos.'}
											</p>
										</div>
									</div>
									<Link href="/dashboard/billing" className="text-sm font-semibold text-yellow-800 hover:text-yellow-900 underline whitespace-nowrap ml-4">
										Regularizar →
									</Link>
								</div>
							</div>
						)}

						<main className="flex-1 overflow-y-auto pb-safe">
							{children}
						</main>
					</div>
				</>
			)}
		</div>
	)
}
