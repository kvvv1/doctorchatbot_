'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
	Save,
	Settings,
	MessageSquare,
	Calendar,
	Bot,
	Bell,
	User as UserIcon,
	CreditCard,
} from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import SignOutButton from '../ui/SignOutButton'
import QuickRepliesManager from './components/QuickRepliesManager'
import NotificationSettingsTab from './components/NotificationSettingsTab'
import AgendaIntegrationTab from './components/AgendaIntegrationTab'
import BotAdvancedSettingsTab from './components/BotAdvancedSettingsTab'

import type { BotSettings, PlanKey } from '@/lib/types/database'
import WhatsAppConnectionTab from './components/WhatsAppConnectionTab'

type WorkDaysState = {
	mon: boolean
	tue: boolean
	wed: boolean
	thu: boolean
	fri: boolean
	sat: boolean
	sun: boolean
}

const DAY_ORDER: Array<keyof WorkDaysState> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function inferStartTime(settings: BotSettings | null): string {
	const enabledDay = settings?.working_hours?.days?.find((day) => day.enabled)
	return enabledDay?.start ?? '08:00'
}

function inferEndTime(settings: BotSettings | null): string {
	const enabledDay = settings?.working_hours?.days?.find((day) => day.enabled)
	return enabledDay?.end ?? '18:00'
}

function inferWorkDays(settings: BotSettings | null): WorkDaysState {
	const defaults: WorkDaysState = {
		mon: true,
		tue: true,
		wed: true,
		thu: true,
		fri: true,
		sat: false,
		sun: false,
	}

	const days = settings?.working_hours?.days
	if (!days?.length) {
		return defaults
	}

	const next = { ...defaults }
	for (const day of days) {
		next[day.day] = day.enabled
	}

	return next
}

type TabId = 'geral' | 'whatsapp' | 'agenda' | 'bot' | 'notificacoes' | 'assinatura' | 'conta'

interface Tab {
	id: TabId
	label: string
	icon: React.ComponentType<{ className?: string }>
}

const TABS: Tab[] = [
	{ id: 'geral', label: 'Geral', icon: Settings },
	{ id: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp },
	{ id: 'agenda', label: 'Agenda', icon: Calendar },
	{ id: 'bot', label: 'Bot', icon: Bot },
	{ id: 'notificacoes', label: 'Notificações', icon: Bell },
	{ id: 'assinatura', label: 'Assinatura', icon: CreditCard },
	{ id: 'conta', label: 'Conta', icon: UserIcon },
]

export default function ConfiguracoesPageClient({
	initialClinicName,
	clinicId,
	initialBotSettings,
	initialDefaultDurationMinutes,
	planKey,
	hasCustomFlows,
}: {
	initialClinicName: string
	clinicId: string
	initialBotSettings: BotSettings | null
	initialDefaultDurationMinutes: number
	planKey: PlanKey | null
	hasCustomFlows: boolean
}) {
	const router = useRouter()
	const searchParams = useSearchParams()
	const [activeTab, setActiveTab] = useState<TabId>('geral')
	const [clinicName, setClinicName] = useState(initialClinicName)
	const [botActive, setBotActive] = useState(true)
	const [isSaving, setIsSaving] = useState(false)
	const [saveMessage, setSaveMessage] = useState<string | null>(null)
	const [loadingBotStatus, setLoadingBotStatus] = useState(true)
	const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(initialDefaultDurationMinutes)

	// Horário de funcionamento
	const [startTime, setStartTime] = useState(() => inferStartTime(initialBotSettings))
	const [endTime, setEndTime] = useState(() => inferEndTime(initialBotSettings))
	const [workDays, setWorkDays] = useState<WorkDaysState>(() => inferWorkDays(initialBotSettings))
	const [workingHoursEnabled, setWorkingHoursEnabled] = useState(
		() => initialBotSettings?.working_hours_enabled ?? true
	)
	const [workTimezone, setWorkTimezone] = useState(
		() => initialBotSettings?.working_hours?.timezone || 'America/Sao_Paulo'
	)

	// Sincronizar aba com URL
	useEffect(() => {
		const tab = searchParams.get('tab') as TabId
		if (tab && TABS.find((t) => t.id === tab)) {
			setActiveTab(tab)
		}
	}, [searchParams])

	// Carregar status do bot
	useEffect(() => {
		const loadBotStatus = async () => {
			try {
				const response = await fetch('/api/bot/status')
				if (response.ok) {
					const data = await response.json()
					setBotActive(data.status === 'active')
				}
			} catch (error) {
				console.error('Error loading bot status:', error)
			} finally {
				setLoadingBotStatus(false)
			}
		}
		loadBotStatus()
	}, [])

	const changeTab = (tabId: TabId) => {
		setActiveTab(tabId)
		router.push(`/dashboard/configuracoes?tab=${tabId}`, { scroll: false })
	}

	const handleSave = async () => {
		if (!clinicName.trim()) {
			setSaveMessage('Informe o nome da clínica.')
			return
		}

		if (startTime >= endTime) {
			setSaveMessage('Horário inválido: o fechamento precisa ser depois da abertura.')
			return
		}

		const enabledDays = Object.values(workDays).some(Boolean)
		if (!enabledDays) {
			setSaveMessage('Selecione pelo menos um dia de funcionamento.')
			return
		}

		setIsSaving(true)
		setSaveMessage(null)

		try {
			const workingHours = {
				timezone: workTimezone,
				days: DAY_ORDER.map((day) => ({
					day,
					enabled: workDays[day],
					start: startTime,
					end: endTime,
				})),
			}

			const response = await fetch('/api/settings/general', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clinicId,
					clinicName,
					defaultDurationMinutes,
					workingHoursEnabled,
					workingHours,
				}),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => null)
				throw new Error(data?.error || 'Falha ao salvar horário de funcionamento')
			}

			setSaveMessage('Configurações gerais salvas com sucesso.')
			router.refresh()
		} catch (error) {
			console.error('Error saving settings:', error)
			setSaveMessage(error instanceof Error ? error.message : 'Erro ao salvar configurações')
		} finally {
			setIsSaving(false)
		}
	}

	const handleToggleBot = async (newValue: boolean) => {
		setBotActive(newValue)

		// Salvar automaticamente no backend
		try {
			const response = await fetch('/api/bot/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_active: newValue }),
			})

			if (!response.ok) {
				throw new Error('Failed to update bot status')
			}
		} catch (error) {
			console.error('Error updating bot status:', error)
			// Reverter em caso de erro
			setBotActive(!newValue)
			alert('Erro ao atualizar status do bot. Tente novamente.')
		}
	}

	return (
		<div className="h-full w-full overflow-y-auto bg-neutral-50">
			{/* Header */}
			<div className="border-b border-neutral-200 bg-white">
				<div className="p-4 sm:p-6 lg:px-8">
					<h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Configurações</h1>
					<p className="mt-1 text-sm text-neutral-600">
						Gerencie as configurações da sua clínica e integração
					</p>
				</div>

				{/* Tabs Navigation */}
				<div className="px-4 sm:px-6 lg:px-8">
					<div className="flex gap-1 overflow-x-auto scrollbar-hide">
						{TABS.map((tab) => {
							const Icon = tab.icon
							const isActive = activeTab === tab.id
							return (
								<button
									key={tab.id}
									onClick={() => changeTab(tab.id)}
									className={`
										flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
										border-b-2 transition-all
										${
											isActive
												? 'border-sky-600 text-sky-700'
												: 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
										}
									`}
								>
									<Icon className={`size-4 ${isActive ? 'text-sky-600' : 'text-neutral-500'}`} />
									{tab.label}
								</button>
							)
						})}
					</div>
				</div>
			</div>

			{/* Tab Content */}
			<div className="p-4 sm:p-6 lg:p-8">
				<div className="max-w-4xl mx-auto">
					{/* Aba Geral */}
					{activeTab === 'geral' && <GeralTab />}

					{/* Aba WhatsApp */}
					{activeTab === 'whatsapp' && <WhatsAppTab />}

					{/* Aba Agenda */}
					{activeTab === 'agenda' && <AgendaTab />}

					{/* Aba Bot */}
					{activeTab === 'bot' && (
						<BotTab
							botActive={botActive}
							loadingBotStatus={loadingBotStatus}
							onToggleBot={handleToggleBot}
							clinicId={clinicId}
							initialBotSettings={initialBotSettings}
							initialDefaultDurationMinutes={defaultDurationMinutes}
							planKey={planKey}
							hasCustomFlows={hasCustomFlows}
						/>
					)}

					{/* Aba Notificações */}
					{activeTab === 'notificacoes' && <NotificationSettingsTab clinicId={clinicId} />}

					{/* Aba Assinatura */}
					{activeTab === 'assinatura' && <AssinaturaTab />}

					{/* Aba Conta */}
					{activeTab === 'conta' && <ContaTab />}
				</div>
			</div>
		</div>
	)

	// ============ TAB COMPONENTS ============

	function GeralTab() {
		return (
			<div className="space-y-6">
				{/* Informações da Clínica */}
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h2 className="mb-2 text-lg font-semibold text-neutral-900">Informações da Clínica</h2>
					<p className="mb-4 text-sm text-neutral-600">
						Defina o nome da sua clínica. Esse nome aparecerá no topo do dashboard e nas comunicações
						com pacientes.
					</p>
					<div className="space-y-4">
						<div>
						<label htmlFor="clinicName" className="block text-sm font-medium text-neutral-700">
							Nome da Clínica
						</label>
						<input
							type="text"
							id="clinicName"
							value={clinicName}
							onChange={(e) => setClinicName(e.target.value)}
							placeholder="Ex: Clínica Dr. Silva"
							className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
						/>
						</div>

						<div>
							<label htmlFor="defaultDuration" className="block text-sm font-medium text-neutral-700">
								Duração padrão da consulta
							</label>
							<select
								id="defaultDuration"
								value={defaultDurationMinutes}
								onChange={(e) => setDefaultDurationMinutes(Number(e.target.value))}
								className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							>
								<option value={15}>15 minutos</option>
								<option value={30}>30 minutos</option>
								<option value={45}>45 minutos</option>
								<option value={60}>60 minutos</option>
								<option value={90}>90 minutos</option>
							</select>
							<p className="mt-1 text-xs text-neutral-500">
								Esse tempo será usado pelo bot e pela agenda como padrão para novos agendamentos.
							</p>
						</div>
					</div>
				</div>

				{/* Horário de Funcionamento */}
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h2 className="mb-2 text-lg font-semibold text-neutral-900">Horário de Funcionamento</h2>
					<p className="mb-4 text-sm text-neutral-600">
						Defina quando sua secretaria está disponível para atendimento. O sistema exibirá "Online"
						durante esses horários e "Offline" fora deles.
					</p>
					<div className="mb-4 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
						<div>
							<p className="text-sm font-medium text-neutral-800">Restringir bot ao horário definido</p>
							<p className="text-xs text-neutral-500">Se desativado, o bot responde em qualquer horário.</p>
						</div>
						<button
							type="button"
							onClick={() => setWorkingHoursEnabled((prev) => !prev)}
							className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
								workingHoursEnabled ? 'bg-sky-600' : 'bg-neutral-300'
							}`}
						>
							<span
								className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
									workingHoursEnabled ? 'translate-x-5' : 'translate-x-1'
								}`}
							/>
						</button>
					</div>
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label htmlFor="startTime" className="block text-sm font-medium text-neutral-700">
									Horário de Abertura
								</label>
								<input
									type="time"
									id="startTime"
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
									className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								/>
							</div>
							<div>
								<label htmlFor="endTime" className="block text-sm font-medium text-neutral-700">
									Horário de Fechamento
								</label>
								<input
									type="time"
									id="endTime"
									value={endTime}
									onChange={(e) => setEndTime(e.target.value)}
									className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								/>
							</div>
						</div>
						<div>
							<label className="block text-sm font-medium text-neutral-700 mb-2">
								Dias de Funcionamento
							</label>
							<div className="flex flex-wrap gap-2">
								{[
									{ key: 'mon', label: 'Seg' },
									{ key: 'tue', label: 'Ter' },
									{ key: 'wed', label: 'Qua' },
									{ key: 'thu', label: 'Qui' },
									{ key: 'fri', label: 'Sex' },
									{ key: 'sat', label: 'Sáb' },
									{ key: 'sun', label: 'Dom' },
								].map((day) => (
									<button
										key={day.key}
										type="button"
										onClick={() => {
											setWorkDays((prev) => ({ ...prev, [day.key]: !prev[day.key as keyof typeof prev] }))
										}}
										className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
											workDays[day.key as keyof typeof workDays]
												? 'bg-sky-600 text-white'
												: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
										}`}
									>
										{day.label}
									</button>
								))}
							</div>
						</div>
						{saveMessage && (
							<p className={`text-sm ${saveMessage.includes('sucesso') ? 'text-emerald-700' : 'text-red-600'}`}>
								{saveMessage}
							</p>
						)}
					</div>
				</div>

				{/* Botão Salvar */}
				<button
					onClick={handleSave}
					disabled={isSaving}
					className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Save className="size-4" />
					{isSaving ? 'Salvando...' : 'Salvar Configurações'}
				</button>
			</div>
		)
	}

	function WhatsAppTab() {
		return (
			<div className="space-y-6">
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h2 className="mb-2 text-lg font-semibold text-neutral-900">Conectar WhatsApp</h2>
					<p className="mb-4 text-sm text-neutral-600">
						Gerencie a conexão do WhatsApp diretamente por aqui. Veja o status em tempo real, gere ou regenere o QR Code e acompanhe se está tudo certo com a sua instância.
					</p>
					<WhatsAppConnectionTab clinicId={clinicId} />
				</div>
			</div>
		)
	}

	function AgendaTab() {
		return (
			<div className="space-y-6">
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h2 className="mb-2 text-lg font-semibold text-neutral-900">
						Integração com Google Calendar
					</h2>
					<p className="mb-4 text-sm text-neutral-600">
						Conecte sua agenda do Google para sincronizar automaticamente as consultas agendadas através do sistema.
					</p>
					<AgendaIntegrationTab clinicId={clinicId} />
				</div>
			</div>
		)
	}

	function BotTab({
		botActive,
		loadingBotStatus,
		onToggleBot,
		clinicId,
		initialBotSettings,
		initialDefaultDurationMinutes,
		planKey,
		hasCustomFlows,
	}: {
		botActive: boolean
		loadingBotStatus: boolean
		onToggleBot: (value: boolean) => void
		clinicId: string
		initialBotSettings: BotSettings | null
		initialDefaultDurationMinutes: number
		planKey: PlanKey | null
		hasCustomFlows: boolean
	}) {
		return (
			<div className="space-y-6">
				{/* Status do Bot */}
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
						<h2 className="mb-2 text-lg font-semibold text-neutral-900">Automação do Bot</h2>
					<p className="mb-4 text-sm text-neutral-600">
						Ative o bot para responder automaticamente pacientes quando a secretária não assumir o
						atendimento. O bot pode agendar consultas, tirar dúvidas e coletar informações.
					</p>
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium text-neutral-700">Bot Ativo</p>
							<p className="text-xs text-neutral-500">
								{loadingBotStatus
									? 'Carregando...'
									: botActive
									? 'Respondendo automaticamente'
									: 'Respostas automáticas pausadas'}
							</p>
						</div>
						<button
							onClick={() => onToggleBot(!botActive)}
							disabled={loadingBotStatus}
							className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
								botActive ? 'bg-sky-600' : 'bg-neutral-300'
							}`}
						>
							<span
								className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
									botActive ? 'translate-x-6' : 'translate-x-1'
								}`}
							/>
						</button>
					</div>
				</div>

				{/* Respostas Rápidas */}
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<QuickRepliesManager clinicId={clinicId} />
				</div>

				{/* Configurações avançadas do bot inline */}
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h3 className="text-sm font-semibold text-neutral-900 mb-2">Configurações avançadas do bot</h3>
					<p className="text-xs text-neutral-600 mb-4">
						Personalize o comportamento, horário de funcionamento e mensagens padrão do bot.
					</p>
					<BotAdvancedSettingsTab
						clinicId={clinicId}
						initialSettings={initialBotSettings}
						initialDefaultDurationMinutes={initialDefaultDurationMinutes}
						planKey={planKey}
						hasCustomFlows={hasCustomFlows}
					/>
				</div>
			</div>
		)
	}

	function AssinaturaTab() {
		return (
			<div className="space-y-6">
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h2 className="mb-2 text-lg font-semibold text-neutral-900">Gerenciar Assinatura</h2>
					<p className="mb-4 text-sm text-neutral-600">
						Visualize seu plano atual, histórico de pagamentos e gerencie sua assinatura.
					</p>
					<a
						href="/dashboard/billing"
						className="block rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 hover:border-sky-500 hover:bg-sky-50 transition-all group"
					>
						<div className="flex items-center gap-4">
							<div className="flex-shrink-0 w-12 h-12 rounded-full bg-sky-100 group-hover:bg-sky-200 flex items-center justify-center transition-colors">
								<CreditCard className="w-6 h-6 text-sky-600" />
							</div>
							<div className="flex-1">
								<h3 className="text-sm font-semibold text-neutral-900 mb-1 group-hover:text-sky-700 transition-colors">
									Acessar Painel de Assinatura
								</h3>
								<p className="text-xs text-neutral-600">
									Ver plano, faturas, mudar plano ou cancelar assinatura
								</p>
							</div>
							<div className="flex-shrink-0">
								<svg
									className="w-5 h-5 text-neutral-400 group-hover:text-sky-600 transition-colors"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
								</svg>
							</div>
						</div>
					</a>
				</div>
			</div>
		)
	}

	function ContaTab() {
		return (
			<div className="space-y-6">
				<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
					<h2 className="mb-4 text-lg font-semibold text-neutral-900">Sessão</h2>
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium text-neutral-700">Encerrar Sessão</p>
							<p className="text-xs text-neutral-500">Sair da sua conta no sistema</p>
						</div>
						<SignOutButton />
					</div>
				</div>
			</div>
		)
	}
}
