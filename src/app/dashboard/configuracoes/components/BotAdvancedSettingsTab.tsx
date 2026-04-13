'use client'

import { useState } from 'react'
import type { BotSettings, PlanKey } from '@/lib/types/database'
import { Save, Bot, MessageSquare } from 'lucide-react'
import UpgradePrompt from '../../components/UpgradePrompt'

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

					<div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
						<div className="flex-1">
							<p className="text-sm font-medium text-neutral-800">Respeitar horário de funcionamento</p>
							<p className="text-xs text-neutral-500">
								O bot envia mensagem de fora do horário quando a clínica está fechada. Configure o horário na aba <span className="font-medium text-sky-700">Clínica</span>.
							</p>
						</div>
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
						>
							<span
								className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
									settings.working_hours_enabled ? 'translate-x-5' : 'translate-x-1'
								}`}
							/>
						</button>
					</div>
				</div>
			</div>

			{/* Mensagens do Bot */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h3 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
					<MessageSquare className="h-4 w-4 text-sky-600" />
					Mensagens do Bot
				</h3>
				<div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
					<p className="text-xs font-medium text-neutral-700 mb-2">Aplicar tom pronto:</p>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() =>
								setSettings({
									...settings,
									message_welcome: MESSAGE_PRESETS.formal.message_welcome,
									message_fallback: MESSAGE_PRESETS.formal.message_fallback,
								})
							}
							className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
						>
							Formal
						</button>
						<button
							type="button"
							onClick={() =>
								setSettings({
									...settings,
									message_welcome: MESSAGE_PRESETS.humanizado.message_welcome,
									message_fallback: MESSAGE_PRESETS.humanizado.message_fallback,
								})
							}
							className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
						>
							Humanizado
						</button>
						<button
							type="button"
							onClick={() =>
								setSettings({
									...settings,
									message_welcome: MESSAGE_PRESETS.direto.message_welcome,
									message_fallback: MESSAGE_PRESETS.direto.message_fallback,
								})
							}
							className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
						>
							Direto
						</button>
					</div>
				</div>
				<div className="space-y-4 text-sm">
					<div>
						<label htmlFor="message-welcome" className="block font-medium text-neutral-800 mb-1">
							Mensagem de boas-vindas
						</label>
						<textarea
							id="message-welcome"
							value={settings.message_welcome}
							onChange={(e) =>
								setSettings({ ...settings, message_welcome: e.target.value })
							}
							rows={2}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
						/>
					</div>

					<div>
						<label htmlFor="message-menu" className="block font-medium text-neutral-800 mb-1">
							Mensagem de menu
						</label>
						<textarea
							id="message-menu"
							value={settings.message_menu}
							onChange={(e) =>
								setSettings({ ...settings, message_menu: e.target.value })
							}
							rows={3}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
						/>
					</div>

					<div>
						<label htmlFor="message-out-of-hours" className="block font-medium text-neutral-800 mb-1">
							Mensagem fora do horário
						</label>
						<textarea
							id="message-out-of-hours"
							value={settings.message_out_of_hours}
							onChange={(e) =>
								setSettings({ ...settings, message_out_of_hours: e.target.value })
							}
							rows={3}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
						/>
					</div>

					<div>
						<label htmlFor="message-fallback" className="block font-medium text-neutral-800 mb-1">
							Mensagem quando não entende
						</label>
						<textarea
							id="message-fallback"
							value={settings.message_fallback}
							onChange={(e) =>
								setSettings({ ...settings, message_fallback: e.target.value })
							}
							rows={2}
							className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
						/>
					</div>

					<div className="pt-2 border-t border-neutral-200 space-y-3">
						<p className="text-xs font-medium text-neutral-700">Mensagens de confirmação</p>
						<div className="space-y-2">
							<div>
								<label htmlFor="message-confirm-schedule" className="block text-xs font-medium text-neutral-700 mb-1">
									Confirmar agendamento
								</label>
								<textarea
									id="message-confirm-schedule"
									value={settings.message_confirm_schedule}
									onChange={(e) =>
										setSettings({ ...settings, message_confirm_schedule: e.target.value })
									}
									rows={2}
									className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
								/>
							</div>

							<div>
								<label htmlFor="message-confirm-reschedule" className="block text-xs font-medium text-neutral-700 mb-1">
									Confirmar remarcação
								</label>
								<textarea
									id="message-confirm-reschedule"
									value={settings.message_confirm_reschedule}
									onChange={(e) =>
										setSettings({ ...settings, message_confirm_reschedule: e.target.value })
									}
									rows={2}
									className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
								/>
							</div>

							<div>
								<label htmlFor="message-confirm-cancel" className="block text-xs font-medium text-neutral-700 mb-1">
									Confirmar cancelamento
								</label>
								<textarea
									id="message-confirm-cancel"
									value={settings.message_confirm_cancel}
									onChange={(e) =>
										setSettings({ ...settings, message_confirm_cancel: e.target.value })
									}
									rows={2}
									className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
								/>
							</div>
						</div>
					</div>
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
