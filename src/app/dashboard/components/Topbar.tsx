'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, Circle, PanelLeft, User } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { formatDatePTBR, isWithinWorkHours, type WorkSchedule } from '@/lib/utils/dateHelpers'
import type { WhatsAppStatus, BotStatus } from './DashboardLayoutClient'
import Tooltip from './Tooltip'
import NotificationBell from './NotificationBell'

interface TopbarProps {
	clinicName: string
	onMenuClick: () => void
	onToggleSidebar: () => void
	isSidebarCollapsed: boolean
	workSchedule?: WorkSchedule
	whatsappStatus: WhatsAppStatus
	botStatus: BotStatus
}

export default function Topbar({ 
	clinicName, 
	onMenuClick, 
	onToggleSidebar, 
	isSidebarCollapsed,
	workSchedule, 
	whatsappStatus, 
	botStatus 
}: TopbarProps) {
	const [currentTime, setCurrentTime] = useState(new Date())
	
	// Atualiza o relógio a cada minuto
	useEffect(() => {
		const timer = setInterval(() => {
			setCurrentTime(new Date())
		}, 60000) // 60 segundos
		
		return () => clearInterval(timer)
	}, [])
	
	const isOnline = isWithinWorkHours(workSchedule, currentTime)
	
	return (
		<header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
			<div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				{/* Left side */}
				<div className="flex items-center gap-4 flex-1 min-w-0">
					{/* Mobile menu button */}
					<button
						onClick={onMenuClick}
						className="lg:hidden rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 transition-colors"
					>
						<Menu className="size-5" />
					</button>
					
					{/* Desktop sidebar toggle button */}
					<button
						onClick={onToggleSidebar}
						className="hidden lg:block rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 transition-colors"
						title={isSidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
					>
						<PanelLeft className="size-5" />
					</button>
					
					<div className="min-w-0 flex-1">
						<h1 className="text-sm font-semibold text-neutral-900 truncate">
							{clinicName}
						</h1>
						{/* Data completa - esconde no mobile */}
						<p className="hidden sm:block text-xs text-neutral-500">
							{formatDatePTBR(currentTime, 'full')}
						</p>
						{/* Data resumida - mostra no mobile */}
						<p className="sm:hidden text-xs text-neutral-500">
							{formatDatePTBR(currentTime, 'short')}
						</p>
					</div>
				</div>
				
				{/* Right side */}
				<div className="flex items-center gap-2 sm:gap-3">
					{/* Status indicator (horário da secretaria) */}
					<Tooltip 
						side="bottom"
						content={
							isOnline 
								? 'Secretaria Online - Dentro do horário de atendimento. Clique para ajustar horários.' 
								: 'Secretaria Offline - Fora do horário de atendimento. Clique para configurar horários.'
						}
					>
						<Link 
							href="/dashboard/configuracoes?tab=horario"
							className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 transition-colors hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
							aria-label={
								isOnline 
									? 'Secretaria online - Ajustar horários' 
									: 'Secretaria offline - Configurar horários'
							}
						>
							<User className="size-3.5 text-neutral-600" />
							<span className="text-xs font-medium text-neutral-700 hidden sm:inline">
								{isOnline ? 'Online' : 'Offline'}
							</span>
							<Circle
								className={`size-2 fill-current ${
									isOnline ? 'text-green-500' : 'text-red-500'
								}`}
							/>
						</Link>
					</Tooltip>
					
					{/* WhatsApp Status Chip - Clicável */}
					<Tooltip 
						side="bottom"
						content={
							whatsappStatus === 'connected' 
								? 'WhatsApp conectado. Clique para ver/gerenciar a conexão e o QR Code.' 
								: whatsappStatus === 'connecting'
								? 'WhatsApp conectando. Aguardando leitura do QR Code.'
								: 'WhatsApp desconectado. Clique para conectar via QR Code nas configurações.'
						}
					>
						<Link 
							href="/dashboard/configuracoes/whatsapp"
							className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
							aria-label={
								whatsappStatus === 'connected' 
									? 'WhatsApp conectado - Clique para gerenciar' 
									: whatsappStatus === 'connecting'
									? 'WhatsApp conectando - Clique para ver QR Code'
									: 'WhatsApp desconectado - Clique para conectar'
							}
						>
							<FaWhatsapp className="size-3.5 text-green-600" />
							<span className="hidden md:inline text-xs font-medium text-neutral-700">
								{whatsappStatus === 'connected' ? 'Conectado' : whatsappStatus === 'connecting' ? 'Conectando' : 'Desconectado'}
							</span>
							<Circle
								className={`size-1.5 fill-current ${
									whatsappStatus === 'connected' ? 'text-green-500' : whatsappStatus === 'connecting' ? 'text-amber-500' : 'text-red-500'
								}`}
							/>
						</Link>
					</Tooltip>
					
					{/* Bot Status Chip - Clicável */}
					<Tooltip 
						side="bottom"
						content={
							botStatus === 'active' 
								? 'Bot ativo. Ele responde automaticamente quando o atendimento humano não assumiu.' 
								: 'Bot pausado. Clique para ativar nas configurações.'
						}
					>
						<Link 
							href="/dashboard/configuracoes?tab=bot"
							className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
							aria-label={
								botStatus === 'active' 
									? 'Bot ativo - Clique para gerenciar' 
									: 'Bot pausado - Clique para ativar'
							}
						>
							<img src="/brand.png" alt="DoctorChatBot" className="size-3.5 object-contain" />
							<span className="hidden md:inline text-xs font-medium text-neutral-700">
								{botStatus === 'active' ? 'Ativo' : 'Pausado'}
							</span>
							<Circle
								className={`size-1.5 fill-current ${
									botStatus === 'active' ? 'text-blue-500' : 'text-neutral-400'
								}`}
							/>
						</Link>
					</Tooltip>
					
					{/* Notifications */}
					<NotificationBell />
				</div>
			</div>
		</header>
	)
}
