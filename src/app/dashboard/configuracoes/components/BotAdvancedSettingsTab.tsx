'use client'

import { useState } from 'react'
import type { BotSettings, PlanKey } from '@/lib/types/database'
import { Save, MessageSquare, Eye, EyeOff } from 'lucide-react'
import UpgradePrompt from '../../components/UpgradePrompt'
import BotWhatsAppPreview from './BotWhatsAppPreview'
import { TEMPLATE_VARIABLES } from '@/lib/bot/interpolate'
import BotMenuOptionsEditor from '../bot/BotMenuOptionsEditor'

const MENU_OPTION_LABELS: Record<string, string> = {
	schedule: 'Agendar consulta',
	view_appointments: 'Ver meus agendamentos',
	reschedule: 'Remarcar consulta',
	cancel: 'Cancelar consulta',
	attendant: 'Falar com secretária',
	waitlist: 'Lista de espera',
}
const DEFAULT_MENU_ORDER = ['schedule', 'view_appointments', 'reschedule', 'cancel', 'attendant', 'waitlist']
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣']

function buildPreviewMenuMessage(settings: BotSettings): string {
	const options = settings.menu_options ?? {
		schedule: true, view_appointments: true, reschedule: true, cancel: true, attendant: true, waitlist: false,
	}
	// Merge stored order with any new keys not yet in the DB (e.g. 'waitlist' added later)
	const storedOrder: string[] = settings.menu_order ?? DEFAULT_MENU_ORDER
	const missingKeys = DEFAULT_MENU_ORDER.filter((k) => !storedOrder.includes(k))
	const order: string[] = [...storedOrder, ...missingKeys]
	const lines: string[] = []
	for (const key of order) {
		if (options[key as keyof typeof options] && MENU_OPTION_LABELS[key]) {
			const emoji = NUMBER_EMOJIS[lines.length] ?? `${lines.length + 1}.`
			lines.push(`${emoji} ${MENU_OPTION_LABELS[key]}`)
		}
	}
	return `Como posso te ajudar? 😊\n${lines.join('\n')}`
}

interface BotAdvancedSettingsTabProps {
	clinicId: string
	initialSettings: BotSettings | null
	planKey: PlanKey | null
	hasCustomFlows: boolean
}

const MESSAGE_PRESETS = {
	formal: {
		message_welcome: 'Olá! Seja bem-vindo(a) à clínica. Sou o assistente virtual e vou te ajudar com seu atendimento.',
		message_fallback: 'Não consegui entender sua solicitação. Pode escolher uma opção do menu ou escrever de outra forma?',
	},
	humanizado: {
		message_welcome: 'Oi! Que bom te ver por aqui 😊 Eu sou a assistente da clínica e vou te ajudar com seu agendamento.',
		message_fallback: 'Não entendi direitinho 😅 Pode me mandar novamente ou escolher uma opção do menu?',
	},
	direto: {
		message_welcome: 'Olá! Sou o assistente da clínica. Escolha uma opção para continuarmos.',
		message_fallback: 'Não entendi. Selecione uma opção do menu para continuar.',
	},
} as const

export default function BotAdvancedSettingsTab({
	clinicId,
	initialSettings,
	planKey,
	hasCustomFlows,
}: BotAdvancedSettingsTabProps) {
	const [settings, setSettings] = useState<BotSettings | null>(initialSettings)
	const [isSaving, setIsSaving] = useState(false)
	const [showPreview, setShowPreview] = useState(true)
	const [toast, setToast] = useState<{
		message: string
		type: 'success' | 'error'
	} | null>(null)

	const showToast = (message: string, type: 'success' | 'error') => {
		setToast({ message, type })
		setTimeout(() => setToast(null), 3000)
	}

	const insertVar = (field: keyof BotSettings, variable: string) => {
		if (!settings) return
		const current = (settings[field] as string) || ''
		setSettings({ ...settings, [field]: current + variable })
	}

	if (!settings) {
		return (
			<div className="text-sm text-red-600">
				Erro ao carregar configurações do bot.
			</div>
		)
	}

	const handleSave = async () => {
		if (!settings) return
		setIsSaving(true)

		try {
			const response = await fetch('/api/bot/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clinicId,
					// working_hours and defaultDurationMinutes are managed in the Clínica tab
					settings: {
						bot_default_enabled: settings.bot_default_enabled,
						working_hours_enabled: settings.working_hours_enabled,
						message_welcome: settings.message_welcome,
						message_menu: settings.message_menu,
						message_out_of_hours: settings.message_out_of_hours,
						message_fallback: settings.message_fallback,
						message_confirm_schedule: settings.message_confirm_schedule,
						message_confirm_reschedule: settings.message_confirm_reschedule,
						message_confirm_cancel: settings.message_confirm_cancel,
						message_takeover: settings.message_takeover,
						takeover_message_enabled: settings.takeover_message_enabled,
						menu_options: settings.menu_options,
						menu_order: settings.menu_order,
						waitlist_notifications_enabled: settings.waitlist_notifications_enabled ?? true,
						particular_days: settings.particular_days ?? [],
						convenios: (settings.convenios ?? []).filter(s => s.trim() !== ''),
						convenio_solicita_carteirinha: settings.convenio_solicita_carteirinha ?? false,							convenios_solicita_carteirinha: settings.convenios_solicita_carteirinha ?? [],					},
				}),
			})

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}))
				const detail = errData?.detail || errData?.error || 'Erro desconhecido'
				throw new Error(detail)
			}

			const data = await response.json()
			setSettings(data.settings)
			showToast('Configurações salvas com sucesso!', 'success')
		} catch (error) {
			console.error('Error saving bot settings:', error)
			showToast(`Erro: ${error instanceof Error ? error.message : 'Tente novamente.'}`, 'error')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className="space-y-6">
			{/* Comportamento do Bot */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h3 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
					<img src="/brand.png" alt="DoctorChatBot" className="h-4 w-4 object-contain" />
					Comportamento do Bot
				</h3>

				<div className="space-y-3">
					<div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
						<div className="flex-1">
							<p className="text-sm font-medium text-neutral-800">Bot ativado por padrão</p>
							<p className="text-xs text-neutral-500">
								Novas conversas iniciam com o bot automaticamente ativado.
							</p>
						</div>
						<button
							type="button"
							onClick={() =>
								setSettings({
									...settings,
									bot_default_enabled: !settings.bot_default_enabled,
								})
							}
							className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
								settings.bot_default_enabled ? 'bg-sky-600' : 'bg-neutral-300'
							}`}
						>
							<span
								className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
									settings.bot_default_enabled ? 'translate-x-5' : 'translate-x-1'
								}`}
							/>
						</button>
					</div>
				</div>
			</div>

			{/* Mensagens do Bot */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
						<MessageSquare className="h-4 w-4 text-sky-600" />
						Mensagens do Bot
					</h3>
					<button
						type="button"
						onClick={() => setShowPreview((v) => !v)}
						className="flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 transition-colors"
					>
						{showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
						{showPreview ? 'Ocultar preview' : 'Ver preview WhatsApp'}
					</button>
				</div>

				{/* Tom de comunicação */}
				<div className="mb-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
					<p className="text-xs font-medium text-neutral-700 mb-2">Aplicar tom pronto:</p>
					<div className="flex flex-wrap gap-2">
						{(['formal', 'humanizado', 'direto'] as const).map((preset) => (
							<button
								key={preset}
								type="button"
								onClick={() =>
									setSettings({
										...settings,
										message_welcome: MESSAGE_PRESETS[preset].message_welcome,
										message_fallback: MESSAGE_PRESETS[preset].message_fallback,
									})
								}
								className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 capitalize"
							>
								{preset.charAt(0).toUpperCase() + preset.slice(1)}
							</button>
						))}
					</div>
				</div>

				{/* Layout: forms + preview */}
				<div className={`gap-6 ${showPreview ? 'lg:grid lg:grid-cols-2' : ''}`}>
					{/* ── Forms column ── */}
					<div className="space-y-4 text-sm min-w-0">
						<div>
							<label htmlFor="message-welcome" className="block font-medium text-neutral-800 mb-1">
								Mensagem de boas-vindas
							</label>
							<p className="text-xs text-neutral-400 mb-1">Enviada como texto simples antes do menu.</p>
							<textarea
								id="message-welcome"
								value={settings.message_welcome}
								onChange={(e) => setSettings({ ...settings, message_welcome: e.target.value })}
								rows={2}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							/>
						</div>

						<div>
							<label className="block font-medium text-neutral-800 mb-1">
								Menu principal
							</label>
							<p className="text-xs text-neutral-400 mb-2">
								Arraste para reordenar. As opções ativadas viram botões/lista interativa automaticamente.
							</p>
							<BotMenuOptionsEditor settings={settings} onChange={setSettings} />
						</div>

						<div>
							<label className="block font-medium text-neutral-800 mb-1">
								Dias para Particular 🏷️
							</label>
							<p className="text-xs text-neutral-400 mb-2">
								Pacientes que escolherem <strong>Convênio</strong> não verão esses dias na lista de agendamento. Pacientes <strong>Particulares</strong> são sempre encaminhados à secretária.
							</p>
							<div className="flex flex-wrap gap-2">
								{([
									{ key: 'mon', label: 'Seg' },
									{ key: 'tue', label: 'Ter' },
									{ key: 'wed', label: 'Qua' },
									{ key: 'thu', label: 'Qui' },
									{ key: 'fri', label: 'Sex' },
									{ key: 'sat', label: 'Sáb' },
									{ key: 'sun', label: 'Dom' },
								] as const).map(({ key, label }) => {
									const selected = (settings.particular_days ?? []).includes(key)
									return (
										<button
											key={key}
											type="button"
											onClick={() => {
												const current = settings.particular_days ?? []
												const next = selected
													? current.filter((d) => d !== key)
													: [...current, key]
												setSettings({ ...settings, particular_days: next })
											}}
											className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
												selected
													? 'bg-sky-600 border-sky-600 text-white'
													: 'bg-white border-neutral-300 text-neutral-700 hover:border-sky-400'
											}`}
										>
											{label}
										</button>
									)
								})}
							</div>
						</div>

						{/* Convênios aceitos */}
						<div>
							<label className="block font-medium text-neutral-800 mb-1">
								Convênios aceitos 🏥
							</label>
							<p className="text-xs text-neutral-400 mb-2">
								Cadastre os planos de saúde aceitos. O paciente que escolher <strong>Convênio</strong> verá essa lista para selecionar o plano.
							</p>
							<div className="space-y-1">
								{(settings.convenios ?? []).map((name, idx) => {
									const solicita = settings.convenios_solicita_carteirinha ?? []
									const carteirinhaOn = name.trim() !== '' && solicita.includes(name.trim())
									const toggleCarteirinha = () => {
										const trimmed = name.trim()
										if (!trimmed) return
										const next = carteirinhaOn
											? solicita.filter(s => s !== trimmed)
											: [...solicita, trimmed]
										setSettings({ ...settings, convenios_solicita_carteirinha: next })
									}
									return (
										<div key={idx} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
											<div className="flex items-center gap-2">
												<input
													type="text"
													value={name}
													onChange={(e) => {
														const prev = name.trim()
														const next = [...(settings.convenios ?? [])]
														next[idx] = e.target.value
														// keep solicita list in sync when name changes
														const newSolicita = (settings.convenios_solicita_carteirinha ?? []).map(s => s === prev ? e.target.value.trim() : s)
														setSettings({ ...settings, convenios: next, convenios_solicita_carteirinha: newSolicita })
													}}
													placeholder="Ex: Unimed, Amil, Bradesco Saúde..."
													className="flex-1 bg-transparent text-sm text-neutral-900 focus:outline-none"
												/>
												<button
													type="button"
													onClick={() => {
														const nextConvenios = (settings.convenios ?? []).filter((_, i) => i !== idx)
														const nextSolicita = (settings.convenios_solicita_carteirinha ?? []).filter(s => s !== name.trim())
														setSettings({ ...settings, convenios: nextConvenios, convenios_solicita_carteirinha: nextSolicita })
													}}
													className="text-rose-500 hover:text-rose-700 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded hover:bg-rose-50 transition-colors"
												>
													Remover
												</button>
											</div>
											{name.trim() !== '' && (
												<div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-200">
													<div className="flex items-center gap-1.5">
														<span className="text-base">📷</span>
														<div>
															<p className="text-xs font-medium text-neutral-700">Solicitar carteirinha</p>
															<p className="text-xs text-neutral-400">{carteirinhaOn ? 'Bot pede foto e transfere para humano' : 'Bot segue para agendamento normal'}</p>
														</div>
													</div>
													<button
														type="button"
														onClick={toggleCarteirinha}
														className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors ${
															carteirinhaOn ? 'bg-sky-600' : 'bg-neutral-300'
														}`}
													>
														<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
															carteirinhaOn ? 'translate-x-5' : 'translate-x-1'
														}`} />
													</button>
												</div>
											)}
										</div>
									)
								})}
								<button
									type="button"
									onClick={() =>
										setSettings({ ...settings, convenios: [...(settings.convenios ?? []), ''] })
									}
									className="mt-2 text-xs font-medium text-sky-700 hover:text-sky-800 flex items-center gap-1"
								>
									+ Adicionar convênio
								</button>
							</div>
						</div>

						<div>
							<div className="flex items-center justify-between mb-1">
								<label htmlFor="message-out-of-hours" className="font-medium text-neutral-800">
									Fora do horário
								</label>
								<button
									type="button"
									onClick={() =>
										setSettings({
											...settings,
											working_hours_enabled: !settings.working_hours_enabled,
										})
									}
									className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
										settings.working_hours_enabled ? 'bg-sky-600' : 'bg-neutral-300'
									}`}
									title={settings.working_hours_enabled ? 'Ativado — clique para desativar' : 'Desativado — clique para ativar'}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
											settings.working_hours_enabled ? 'translate-x-5' : 'translate-x-1'
										}`}
									/>
								</button>
							</div>
							<p className="text-xs text-neutral-400 mb-1">
								{settings.working_hours_enabled
									? 'Ativado — mensagem enviada fora do horário de funcionamento.'
									: 'Desativado — bot responde normalmente em qualquer horário.'}
							</p>
							<textarea
								id="message-out-of-hours"
								value={settings.message_out_of_hours}
								onChange={(e) => setSettings({ ...settings, message_out_of_hours: e.target.value })}
								rows={3}
								disabled={!settings.working_hours_enabled}
							className={`w-full px-3 py-2 border rounded-lg text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors ${
									settings.working_hours_enabled
										? 'border-neutral-300 text-neutral-900 bg-white'
										: 'border-neutral-200 text-neutral-400 bg-neutral-50 cursor-not-allowed'
								}`}
							/>
						</div>

						<div>
							<label htmlFor="message-fallback" className="block font-medium text-neutral-800 mb-1">
								Não entendeu
							</label>
							<p className="text-xs text-neutral-400 mb-1">Enviada quando o bot não compreende a mensagem.</p>
							<textarea
								id="message-fallback"
								value={settings.message_fallback}
								onChange={(e) => setSettings({ ...settings, message_fallback: e.target.value })}
								rows={2}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							/>
						</div>

						<div className="pt-3 border-t border-neutral-200">
							<p className="text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
								Confirmações automáticas
							</p>
							<p className="text-xs text-neutral-400 mb-3">
								Clique nas variáveis para inserir no campo. Os valores reais são preenchidos automaticamente no envio.
							</p>
							<div className="space-y-3">
								<div>
									<label htmlFor="message-confirm-schedule" className="block text-xs font-medium text-neutral-700 mb-1">
										Consulta agendada
									</label>
									<textarea
										id="message-confirm-schedule"
										value={settings.message_confirm_schedule}
										onChange={(e) => setSettings({ ...settings, message_confirm_schedule: e.target.value })}
										rows={2}
										className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
									/>
									<div className="flex flex-wrap gap-1 mt-1">
										{TEMPLATE_VARIABLES.map((v) => (
											<button key={v.key} type="button" title={v.description}
												onClick={() => insertVar('message_confirm_schedule', v.label)}
												className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 hover:bg-sky-100 transition-colors">
												{v.label}
											</button>
										))}
									</div>
								</div>
								<div>
									<label htmlFor="message-confirm-reschedule" className="block text-xs font-medium text-neutral-700 mb-1">
										Consulta remarcada
									</label>
									<textarea
										id="message-confirm-reschedule"
										value={settings.message_confirm_reschedule}
										onChange={(e) => setSettings({ ...settings, message_confirm_reschedule: e.target.value })}
										rows={2}
										className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
									/>
									<div className="flex flex-wrap gap-1 mt-1">
										{TEMPLATE_VARIABLES.map((v) => (
											<button key={v.key} type="button" title={v.description}
												onClick={() => insertVar('message_confirm_reschedule', v.label)}
												className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 hover:bg-sky-100 transition-colors">
												{v.label}
											</button>
										))}
									</div>
								</div>
								<div>
									<label htmlFor="message-confirm-cancel" className="block text-xs font-medium text-neutral-700 mb-1">
										Consulta cancelada
									</label>
									<textarea
										id="message-confirm-cancel"
										value={settings.message_confirm_cancel}
										onChange={(e) => setSettings({ ...settings, message_confirm_cancel: e.target.value })}
										rows={2}
										className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
									/>
									<div className="flex flex-wrap gap-1 mt-1">
										{TEMPLATE_VARIABLES.map((v) => (
											<button key={v.key} type="button" title={v.description}
												onClick={() => insertVar('message_confirm_cancel', v.label)}
												className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 hover:bg-sky-100 transition-colors">
												{v.label}
											</button>
										))}
									</div>
								</div>
							</div>
						</div>

						{/* Takeover message */}
						<div className="pt-3 border-t border-neutral-200">
							<p className="text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
								Atendimento humano
							</p>
							<p className="text-xs text-neutral-400 mb-3">
								Mensagem enviada ao paciente quando um atendente assume o chat.
							</p>
							<label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
								<input
									type="checkbox"
									checked={settings.takeover_message_enabled ?? true}
									onChange={(e) => setSettings({ ...settings, takeover_message_enabled: e.target.checked })}
									className="size-4 rounded border-neutral-300 accent-sky-600"
								/>
								<span className="text-sm font-medium text-neutral-700">Enviar mensagem ao assumir</span>
							</label>
							{(settings.takeover_message_enabled ?? true) && (
								<textarea
									value={settings.message_takeover ?? ''}
									onChange={(e) => setSettings({ ...settings, message_takeover: e.target.value })}
									rows={2}
									placeholder="Olá! Sou um atendente da clínica e estou aqui para te ajudar. 😊"
									className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								/>
							)}
						</div>
					</div>

					{/* ── Preview column ── */}
					{showPreview && (
						<div className="mt-6 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
							<BotWhatsAppPreview
								welcomeMessage={settings.message_welcome}
								menuMessage={buildPreviewMenuMessage(settings)}
								outOfHoursMessage={settings.message_out_of_hours}
								fallbackMessage={settings.message_fallback}
								confirmScheduleMessage={settings.message_confirm_schedule}
								confirmRescheduleMessage={settings.message_confirm_reschedule}
								confirmCancelMessage={settings.message_confirm_cancel}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Fluxos personalizados avançados */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h3 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-2">
					<MessageSquare className="h-4 w-4 text-sky-600" />
					Fluxos personalizados avançados
				</h3>
				{!hasCustomFlows ? (
					<UpgradePrompt
						featureName="Fluxos Personalizados Avançados"
						requiredPlans={['Profissional', 'Clinic Pro']}
						currentPlan={planKey}
						className="mt-2"
					/>
				) : (
					<div className="text-xs text-neutral-600 space-y-2">
						<p>
							Configure fluxos personalizados de conversação para diferentes cenários. Em breve, você poderá
								criar jornadas completas de atendimento.
						</p>
						<p className="italic text-neutral-500">
							Funcionalidade em desenvolvimento – novidades em breve.
						</p>
					</div>
				)}
			</div>

			{/* Botão salvar */}
			<div className="flex justify-end">
				<button
					onClick={handleSave}
					disabled={isSaving}
					className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSaving ? (
						<>
							<div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
							Salvando...
						</>
					) : (
						<>
							<Save className="h-4 w-4" />
							Salvar configurações do bot
						</>
					)}
				</button>
			</div>

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
