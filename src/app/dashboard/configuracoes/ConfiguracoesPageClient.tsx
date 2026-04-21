'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
	Save,
	Settings2,
	MessageSquare,
	Bot,
	Bell,
	User as UserIcon,
	CreditCard,
	Plug,
	Clock,
} from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import SignOutButton from '../ui/SignOutButton'
import QuickRepliesManager from './components/QuickRepliesManager'
import NotificationSettingsTab from './components/NotificationSettingsTab'
import AgendaIntegrationTab from './components/AgendaIntegrationTab'
import BotAdvancedSettingsTab from './components/BotAdvancedSettingsTab'
import WhatsAppConnectionTab from './components/WhatsAppConnectionTab'

import type { BotSettings, PlanKey, WorkingHoursDay } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'clinica' | 'whatsapp' | 'integracoes' | 'bot' | 'notificacoes' | 'plano' | 'conta'

interface Tab {
	id: TabId
	label: string
	icon: React.ComponentType<{ className?: string }>
}

// Backward-compat map: old tab IDs → new tab IDs
const TAB_ALIASES: Record<string, TabId> = {
	geral: 'clinica',
	agenda: 'integracoes',
	assinatura: 'plano',
}

const TABS: Tab[] = [
	{ id: 'clinica', label: 'Clínica', icon: Settings2 },
	{ id: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp },
	{ id: 'integracoes', label: 'Integrações', icon: Plug },
	{ id: 'bot', label: 'Bot', icon: Bot },
	{ id: 'notificacoes', label: 'Notificações', icon: Bell },
	{ id: 'plano', label: 'Plano', icon: CreditCard },
	{ id: 'conta', label: 'Conta', icon: UserIcon },
]

const DAY_ORDER: WorkingHoursDay['day'][] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DAY_LABELS: Record<string, string> = {
	mon: 'Segunda-feira',
	tue: 'Terça-feira',
	wed: 'Quarta-feira',
	thu: 'Quinta-feira',
	fri: 'Sexta-feira',
	sat: 'Sábado',
	sun: 'Domingo',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDefaultWorkingHours(settings: BotSettings | null): WorkingHoursDay[] {
	if (settings?.working_hours?.days?.length === 7) {
		// Retrocompatibilidade: garante que campos de tarde existam
		return settings.working_hours.days.map((d) => ({
			...d,
			has_afternoon: d.has_afternoon ?? false,
			afternoon_start: d.afternoon_start ?? '13:00',
			afternoon_end: d.afternoon_end ?? '18:00',
		}))
	}
	return DAY_ORDER.map((day) => ({
		day,
		enabled: ['mon', 'tue', 'wed', 'thu', 'fri'].includes(day),
		start: '08:00',
		end: '12:00',
		has_afternoon: true,
		afternoon_start: '13:00',
		afternoon_end: '18:00',
	}))
}

// ---------------------------------------------------------------------------
// Toggle component (reusable)
// ---------------------------------------------------------------------------

function Toggle({
	value,
	onChange,
	disabled,
}: {
	value: boolean
	onChange: (v: boolean) => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!value)}
			disabled={disabled}
			className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
				value ? 'bg-sky-600' : 'bg-neutral-300'
			}`}
		>
			<span
				className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
					value ? 'translate-x-5' : 'translate-x-1'
				}`}
			/>
		</button>
	)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConfiguracoesPageClient({
	initialClinicName,
	clinicId,
	initialBotSettings,
	initialDefaultDurationMinutes,
	initialParticularDurationMinutes,
	initialConvenioDurationMinutes,
	planKey,
	hasCustomFlows,
	hasCalendarIntegrationAccess,
}: {
	initialClinicName: string
	clinicId: string
	initialBotSettings: BotSettings | null
	initialDefaultDurationMinutes: number
	initialParticularDurationMinutes: number | null
	initialConvenioDurationMinutes: number | null
	planKey: PlanKey | null
	hasCustomFlows: boolean
	hasCalendarIntegrationAccess: boolean
}) {
	const router = useRouter()
	const searchParams = useSearchParams()
	const [activeTab, setActiveTab] = useState<TabId>('clinica')
	const [botActive, setBotActive] = useState(true)
	const [loadingBotStatus, setLoadingBotStatus] = useState(true)

	// Sync active tab from URL (with backward-compat aliases)
	useEffect(() => {
		const raw = searchParams.get('tab') ?? ''
		const resolved = (TAB_ALIASES[raw] ?? raw) as TabId
		if (resolved && TABS.find((t) => t.id === resolved)) {
			setActiveTab(resolved)
		}
	}, [searchParams])

	// Load bot on/off status
	useEffect(() => {
		fetch('/api/bot/status')
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data) setBotActive(data.status === 'active')
			})
			.catch(console.error)
			.finally(() => setLoadingBotStatus(false))
	}, [])

	const changeTab = (tabId: TabId) => {
		setActiveTab(tabId)
		router.push(`/dashboard/configuracoes?tab=${tabId}`, { scroll: false })
	}

	const handleToggleBot = async (newValue: boolean) => {
		setBotActive(newValue)
		try {
			const res = await fetch('/api/bot/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_active: newValue }),
			})
			if (!res.ok) throw new Error()
		} catch {
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
						Gerencie sua clínica, integrações e automações
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
									className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
										isActive
											? 'border-sky-600 text-sky-700'
											: 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
									}`}
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
					{activeTab === 'clinica' && (
						<ClinicaTab
							clinicId={clinicId}
							initialClinicName={initialClinicName}
							initialDefaultDurationMinutes={initialDefaultDurationMinutes}
							initialParticularDurationMinutes={initialParticularDurationMinutes}
							initialConvenioDurationMinutes={initialConvenioDurationMinutes}
							initialBotSettings={initialBotSettings}
						/>
					)}
					{activeTab === 'whatsapp' && <WhatsAppTab clinicId={clinicId} />}
					{activeTab === 'integracoes' && (
						<IntegracoesTab
							clinicId={clinicId}
							planKey={planKey}
							hasCalendarIntegrationAccess={hasCalendarIntegrationAccess}
						/>
					)}
					{activeTab === 'bot' && (
						<BotTab
							botActive={botActive}
							loadingBotStatus={loadingBotStatus}
							onToggleBot={handleToggleBot}
							clinicId={clinicId}
							initialBotSettings={initialBotSettings}
							planKey={planKey}
							hasCustomFlows={hasCustomFlows}
						/>
					)}
					{activeTab === 'notificacoes' && <NotificationSettingsTab clinicId={clinicId} />}
					{activeTab === 'plano' && <PlanoTab planKey={planKey} />}
					{activeTab === 'conta' && <ContaTab />}
				</div>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Clínica Tab — nome, duração e horário de funcionamento
// ---------------------------------------------------------------------------

function ClinicaTab({
	clinicId,
	initialClinicName,
	initialDefaultDurationMinutes,
	initialParticularDurationMinutes,
	initialConvenioDurationMinutes,
	initialBotSettings,
}: {
	clinicId: string
	initialClinicName: string
	initialDefaultDurationMinutes: number
	initialParticularDurationMinutes: number | null
	initialConvenioDurationMinutes: number | null
	initialBotSettings: BotSettings | null
}) {
	const router = useRouter()
	const [clinicName, setClinicName] = useState(initialClinicName)
	const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(initialDefaultDurationMinutes)
	const [particularDurationMinutes, setParticularDurationMinutes] = useState<number | null>(initialParticularDurationMinutes)
	const [convenioDurationMinutes, setConvenioDurationMinutes] = useState<number | null>(initialConvenioDurationMinutes)
	const [workingHoursEnabled, setWorkingHoursEnabled] = useState(
		initialBotSettings?.working_hours_enabled ?? true
	)
	const [timezone] = useState(
		initialBotSettings?.working_hours?.timezone || 'America/Sao_Paulo'
	)
	const [days, setDays] = useState<WorkingHoursDay[]>(() =>
		buildDefaultWorkingHours(initialBotSettings)
	)
	const [isSaving, setIsSaving] = useState(false)
	const [isSavingDuration, setIsSavingDuration] = useState(false)
	const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

	// Sync local state when server refreshes parent props (e.g. after router.refresh())
	useEffect(() => {
		setDefaultDurationMinutes(initialDefaultDurationMinutes)
		setParticularDurationMinutes(initialParticularDurationMinutes)
		setConvenioDurationMinutes(initialConvenioDurationMinutes)
	}, [initialDefaultDurationMinutes, initialParticularDurationMinutes, initialConvenioDurationMinutes])

	const showToast = (message: string, type: 'success' | 'error') => {
		setToast({ message, type })
		setTimeout(() => setToast(null), 3500)
	}

	const saveDuration = async () => {
		if (isSavingDuration) return
		setIsSavingDuration(true)
		try {
			const res = await fetch('/api/appointment-settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					defaultDurationMinutes,
					particularDurationMinutes,
					convenioDurationMinutes,
				}),
			})
			const data = await res.json().catch(() => null)
			if (!res.ok) throw new Error(data?.error || 'Falha ao salvar')
			if (data?.defaultDurationMinutes) setDefaultDurationMinutes(data.defaultDurationMinutes)
			if (data?.particularDurationMinutes !== undefined) setParticularDurationMinutes(data.particularDurationMinutes)
			if (data?.convenioDurationMinutes !== undefined) setConvenioDurationMinutes(data.convenioDurationMinutes)
			showToast('Duração salva com sucesso!', 'success')
			router.refresh()
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Erro ao salvar duração.', 'error')
		} finally {
			setIsSavingDuration(false)
		}
	}

	const updateDay = (day: string, field: keyof WorkingHoursDay, value: unknown) => {
		setDays((prev) =>
			prev.map((d) => (d.day === day ? { ...d, [field]: value } : d))
		)
	}

	const handleSave = async () => {
		if (!clinicName.trim()) {
			showToast('Informe o nome da clínica.', 'error')
			return
		}

		const enabledDays = days.filter((d) => d.enabled)
		if (workingHoursEnabled && enabledDays.length === 0) {
			showToast('Selecione pelo menos um dia de funcionamento.', 'error')
			return
		}

		for (const d of enabledDays) {
			if (d.start >= d.end) {
				showToast(`Horário inválido em ${DAY_LABELS[d.day]}: fechamento precisa ser depois da abertura.`, 'error')
				return
			}
		}

		setIsSaving(true)
		try {
			const res = await fetch('/api/settings/general', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clinicId,
					clinicName,
					defaultDurationMinutes,
					workingHoursEnabled,
					workingHours: { timezone, days },
				}),
			})

			if (!res.ok) {
				const data = await res.json().catch(() => null)
				throw new Error(data?.error || 'Falha ao salvar')
			}

			const data = await res.json().catch(() => null)
			if (data?.defaultDurationMinutes) {
				setDefaultDurationMinutes(data.defaultDurationMinutes)
			}

			showToast('Configurações salvas com sucesso!', 'success')
			router.refresh()
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Erro ao salvar configurações.', 'error')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className="space-y-6">
			{/* Informações da Clínica */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-1 text-lg font-semibold text-neutral-900">Informações da Clínica</h2>
				<p className="mb-4 text-sm text-neutral-500">
					Nome exibido no dashboard e nas comunicações com pacientes.
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
							className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
						/>
					</div>
					<div>
						<label htmlFor="defaultDuration" className="block text-sm font-medium text-neutral-700">
							Duração padrão da consulta
						</label>
						<div className="mt-1 flex flex-wrap items-center gap-2">
							{[10, 15, 20, 30, 45, 60, 90].map((min) => (
								<button
									key={min}
									type="button"
									onClick={() => setDefaultDurationMinutes(min)}
									className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
										defaultDurationMinutes === min
											? 'border-sky-500 bg-sky-600 text-white'
											: 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
									}`}
								>
									{min} min
								</button>
							))}
							<div className="flex items-center gap-1.5 ml-1">
								<span className="text-sm text-neutral-500">Personalizado:</span>
								<input
									id="defaultDuration"
									type="number"
									min={5}
									max={480}
									step={5}
									value={defaultDurationMinutes}
									onChange={(e) => {
										const v = Number(e.target.value)
										if (v >= 5 && v <= 480) setDefaultDurationMinutes(v)
									}}
									className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								/>
								<span className="text-sm text-neutral-500">min</span>
							</div>
						</div>
						<p className="mt-2 text-xs text-neutral-500">
								Padrão usado quando o tipo de consulta não tiver duração específica.
							</p>
					</div>

					{/* Duração por tipo */
					<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-4">
						<p className="text-sm font-medium text-neutral-700">
							Duração por tipo de consulta <span className="text-neutral-400 font-normal">(opcional — sobrepõe o padrão)</span>
						</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							{/* Particular */}
							<div>
								<label className="block text-sm font-medium text-neutral-700 mb-1">
									🏥 Particular
								</label>
								<div className="flex flex-wrap gap-1.5">
									{[15, 20, 30, 40, 45, 60].map((min) => (
										<button
											key={min}
											type="button"
											onClick={() => setParticularDurationMinutes(particularDurationMinutes === min ? null : min)}
											className={`rounded-lg border px-2.5 py-1 text-sm font-medium transition-colors ${
												particularDurationMinutes === min
													? 'border-sky-500 bg-sky-600 text-white'
													: 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
											}`}
										>
											{min} min
										</button>
									))}
									<div className="flex items-center gap-1">
										<input
											type="number"
											min={5}
											max={480}
											step={5}
											placeholder="Outro"
											value={particularDurationMinutes ?? ''}
											onChange={(e) => {
												const v = e.target.value === '' ? null : Number(e.target.value)
												setParticularDurationMinutes(v && v >= 5 && v <= 480 ? v : null)
											}}
											className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
										/>
										<span className="text-xs text-neutral-400">min</span>
									</div>
								</div>
							</div>
							{/* Convênio */}
							<div>
								<label className="block text-sm font-medium text-neutral-700 mb-1">
									📋 Convênio
								</label>
								<div className="flex flex-wrap gap-1.5">
									{[15, 20, 30, 40, 45, 60].map((min) => (
										<button
											key={min}
											type="button"
											onClick={() => setConvenioDurationMinutes(convenioDurationMinutes === min ? null : min)}
											className={`rounded-lg border px-2.5 py-1 text-sm font-medium transition-colors ${
												convenioDurationMinutes === min
													? 'border-sky-500 bg-sky-600 text-white'
													: 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
											}`}
										>
											{min} min
										</button>
									))}
									<div className="flex items-center gap-1">
										<input
											type="number"
											min={5}
											max={480}
											step={5}
											placeholder="Outro"
											value={convenioDurationMinutes ?? ''}
											onChange={(e) => {
												const v = e.target.value === '' ? null : Number(e.target.value)
												setConvenioDurationMinutes(v && v >= 5 && v <= 480 ? v : null)
											}}
											className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
										/>
										<span className="text-xs text-neutral-400">min</span>
									</div>
								</div>
							</div>
						</div>
						<div className="mt-4 flex items-center gap-3">
							<button
								type="button"
								onClick={saveDuration}
								disabled={isSavingDuration}
								className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
							>
								{isSavingDuration ? 'Salvando...' : 'Salvar duração'}
							</button>
						</div>
					</div>
				</div>
			</div>

		{/* Horário de Funcionamento */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<div className="flex items-start justify-between mb-4">
					<div>
						<h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
							<Clock className="size-5 text-sky-600" />
							Horário de Funcionamento
						</h2>
						<p className="mt-1 text-sm text-neutral-500">
							Defina quando a clínica atende. O bot respeita esses horários quando configurado.
						</p>
					</div>
					<Toggle value={workingHoursEnabled} onChange={setWorkingHoursEnabled} />
				</div>

				{workingHoursEnabled && (
					<div className="space-y-2">
						{days.map((day) => (
							<div
								key={day.day}
								className={`rounded-lg border p-3 transition-colors ${
									day.enabled ? 'border-neutral-200 bg-neutral-50' : 'border-neutral-100 bg-white opacity-60'
								}`}
							>
								{/* Linha principal: checkbox + nome do dia */}
								<div className="flex items-center gap-3 flex-wrap">
									<input
										type="checkbox"
										checked={day.enabled}
										onChange={(e) => updateDay(day.day, 'enabled', e.target.checked)}
										className="h-4 w-4 rounded text-sky-600 accent-sky-600"
									/>
									<span className="w-32 text-sm font-semibold text-neutral-800 shrink-0">
										{DAY_LABELS[day.day]}
									</span>

									{day.enabled && (
										<>
											{/* Turno da manhã */}
											<div className="flex items-center gap-1.5">
												<span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Manhã</span>
												<input
													type="time"
													value={day.start}
													onChange={(e) => updateDay(day.day, 'start', e.target.value)}
													className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none"
												/>
												<span className="text-xs text-neutral-400">até</span>
												<input
													type="time"
													value={day.end}
													onChange={(e) => updateDay(day.day, 'end', e.target.value)}
													className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none"
												/>
											</div>

											{/* Toggle turno da tarde */}
											<button
												type="button"
												onClick={() => updateDay(day.day, 'has_afternoon', !day.has_afternoon)}
												className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
													day.has_afternoon
														? 'bg-sky-50 border-sky-300 text-sky-700'
														: 'bg-white border-neutral-300 text-neutral-500 hover:border-neutral-400'
												}`}
											>
												{day.has_afternoon ? '+ Tarde ✓' : '+ Tarde'}
											</button>
										</>
									)}
								</div>

								{/* Turno da tarde */}
								{day.enabled && day.has_afternoon && (
									<div className="mt-2 ml-7 flex items-center gap-1.5 flex-wrap">
										<span className="text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">Tarde</span>
										<input
											type="time"
											value={day.afternoon_start ?? '13:00'}
											onChange={(e) => updateDay(day.day, 'afternoon_start', e.target.value)}
											className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none"
										/>
										<span className="text-xs text-neutral-400">até</span>
										<input
											type="time"
											value={day.afternoon_end ?? '18:00'}
											onChange={(e) => updateDay(day.day, 'afternoon_end', e.target.value)}
											className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none"
										/>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Save */}
			<button
				onClick={handleSave}
				disabled={isSaving}
				className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<Save className="size-4" />
				{isSaving ? 'Salvando...' : 'Salvar configurações da clínica'}
			</button>

			{toast && (
				<div className="fixed bottom-6 right-6 z-50">
					<div
						className={`px-4 py-3 rounded-lg text-sm shadow-lg ${
							toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
						}`}
					>
						{toast.message}
					</div>
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// WhatsApp Tab
// ---------------------------------------------------------------------------

function WhatsAppTab({ clinicId }: { clinicId: string }) {
	return (
		<div className="space-y-6">
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-2 text-lg font-semibold text-neutral-900">Conexão WhatsApp</h2>
				<p className="mb-4 text-sm text-neutral-500">
					Gerencie a conexão da sua instância WhatsApp. Acompanhe o status em tempo real e gere um
					novo QR Code quando necessário.
				</p>
				<WhatsAppConnectionTab clinicId={clinicId} />
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Integrações Tab — Google Calendar + GestaoDS (e futuras)
// ---------------------------------------------------------------------------

function IntegracoesTab({
	clinicId,
	planKey,
	hasCalendarIntegrationAccess,
}: {
	clinicId: string
	planKey: PlanKey | null
	hasCalendarIntegrationAccess: boolean
}) {
	return (
		<div className="space-y-6">
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-2 text-lg font-semibold text-neutral-900">Integrações</h2>
				<p className="mb-4 text-sm text-neutral-500">
					A agenda manual e pelo DoctorChatBot continua disponível no Essencial. Esta área
					controla apenas integrações externas, como Google Calendar e GestãoDS.
				</p>
				<AgendaIntegrationTab
					clinicId={clinicId}
					currentPlan={planKey}
					hasCalendarIntegrationAccess={hasCalendarIntegrationAccess}
				/>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Bot Tab — status + comportamento + mensagens + respostas rápidas
// ---------------------------------------------------------------------------

function BotTab({
	botActive,
	loadingBotStatus,
	onToggleBot,
	clinicId,
	initialBotSettings,
	planKey,
	hasCustomFlows,
}: {
	botActive: boolean
	loadingBotStatus: boolean
	onToggleBot: (value: boolean) => void
	clinicId: string
	initialBotSettings: BotSettings | null
	planKey: PlanKey | null
	hasCustomFlows: boolean
}) {
	return (
		<div className="space-y-6">
			{/* Status do Bot */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-1 text-lg font-semibold text-neutral-900">Automação do Bot</h2>
				<p className="mb-4 text-sm text-neutral-500">
					Quando ativo, o bot responde automaticamente às mensagens enquanto nenhum atendente
					assume a conversa.
				</p>
				<div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4">
					<div>
						<p className="text-sm font-medium text-neutral-800">Bot ativo</p>
						<p className="text-xs text-neutral-500">
							{loadingBotStatus
								? 'Carregando...'
								: botActive
								? 'Respondendo automaticamente'
								: 'Respostas automáticas pausadas'}
						</p>
					</div>
					<Toggle value={botActive} onChange={onToggleBot} disabled={loadingBotStatus} />
				</div>
			</div>

			{/* Comportamento + Mensagens (BotAdvancedSettingsTab) */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h3 className="mb-1 text-base font-semibold text-neutral-900 flex items-center gap-2">
					<MessageSquare className="size-4 text-sky-600" />
					Comportamento e Mensagens
				</h3>
				<p className="mb-4 text-sm text-neutral-500">
					Configure o tom do bot, as mensagens automáticas e o comportamento em horários fora de
					expediente.
				</p>
				<BotAdvancedSettingsTab
					clinicId={clinicId}
					initialSettings={initialBotSettings}
					planKey={planKey}
					hasCustomFlows={hasCustomFlows}
				/>
			</div>

			{/* Respostas Rápidas */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<QuickRepliesManager clinicId={clinicId} />
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Plano Tab
// ---------------------------------------------------------------------------

const PLAN_LABELS: Record<string, { label: string; description: string }> = {
	free: { label: 'Gratuito', description: 'Plano básico com funcionalidades essenciais.' },
	starter: { label: 'Starter', description: 'Ideal para consultórios pequenos.' },
	pro: { label: 'Profissional', description: 'Recursos avançados para clínicas em crescimento.' },
	clinic_pro: { label: 'Clinic Pro', description: 'Solução completa para clínicas maiores.' },
}

function PlanoTab({ planKey }: { planKey: PlanKey | null }) {
	const plan = planKey ? (PLAN_LABELS[planKey] ?? null) : null

	return (
		<div className="space-y-6">
			{/* Plano atual */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-4 text-lg font-semibold text-neutral-900">Plano atual</h2>
				{plan ? (
					<div className="flex items-center gap-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
						<div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-sky-100">
							<CreditCard className="w-6 h-6 text-sky-600" />
						</div>
						<div>
							<p className="text-base font-semibold text-sky-800">{plan.label}</p>
							<p className="text-sm text-sky-600">{plan.description}</p>
						</div>
					</div>
				) : (
					<p className="text-sm text-neutral-500">Nenhum plano ativo encontrado.</p>
				)}
			</div>

			{/* Gerenciar assinatura */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-2 text-lg font-semibold text-neutral-900">Gerenciar assinatura</h2>
				<p className="mb-4 text-sm text-neutral-500">
					Veja faturas, mude de plano ou cancele sua assinatura.
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
							<h3 className="text-sm font-semibold text-neutral-900 group-hover:text-sky-700 transition-colors">
								Acessar painel de assinatura
							</h3>
							<p className="text-xs text-neutral-500">
								Plano, faturas e cancelamento
							</p>
						</div>
						<svg
							className="w-5 h-5 text-neutral-400 group-hover:text-sky-600 transition-colors"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
					</div>
				</a>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Conta Tab
// ---------------------------------------------------------------------------

function ContaTab() {
	return (
		<div className="space-y-6">
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h2 className="mb-4 text-lg font-semibold text-neutral-900">Sessão</h2>
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium text-neutral-700">Encerrar sessão</p>
						<p className="text-xs text-neutral-500">Sair da sua conta</p>
					</div>
					<SignOutButton />
				</div>
			</div>
		</div>
	)
}
