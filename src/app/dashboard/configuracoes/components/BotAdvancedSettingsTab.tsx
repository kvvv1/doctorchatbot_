'use client'

import { useState } from 'react'
import type { BotSettings, PlanKey } from '@/lib/types/database'
import { Save, Bot, MessageSquare, Eye, EyeOff } from 'lucide-react'
import UpgradePrompt from '../../components/UpgradePrompt'
import BotWhatsAppPreview from './BotWhatsAppPreview'
import { TEMPLATE_VARIABLES } from '@/lib/bot/interpolate'

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
					},
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to save settings')
			}

			const data = await response.json()
			setSettings(data.settings)
			showToast('Configurações salvas com sucesso!', 'success')
		} catch (error) {
			console.error('Error saving bot settings:', error)
			showToast('Erro ao salvar configurações. Tente novamente.', 'error')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className="space-y-6">
			{/* Comportamento do Bot */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h3 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
					<Bot className="h-4 w-4 text-sky-600" />
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
							<label htmlFor="message-menu" className="block font-medium text-neutral-800 mb-1">
								Menu principal
							</label>
							<p className="text-xs text-neutral-400 mb-1">
								As linhas numeradas (1. Agendar, 2. Remarcar…) viram botões/lista interativa automaticamente.
							</p>
							<textarea
								id="message-menu"
								value={settings.message_menu}
								onChange={(e) => setSettings({ ...settings, message_menu: e.target.value })}
								rows={7}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							/>
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
								Use as variáveis abaixo para personalizar com os dados reais do agendamento:
							</p>
							{/* Variable chips */}
							<div className="flex flex-wrap gap-1.5 mb-4">
								{TEMPLATE_VARIABLES.map((v) => (
									<span
										key={v.key}
										title={v.description}
										className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[11px] text-sky-700 cursor-default select-all"
									>
										{v.label}
										<span className="font-sans text-[10px] text-sky-500 non-mono">= {v.description}</span>
									</span>
								))}
							</div>
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
								</div>
							</div>
						</div>
					</div>

					{/* ── Preview column ── */}
					{showPreview && (
						<div className="mt-6 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
							<BotWhatsAppPreview
								welcomeMessage={settings.message_welcome}
								menuMessage={settings.message_menu}
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
