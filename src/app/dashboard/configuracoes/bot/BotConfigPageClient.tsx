'use client'

import { useState } from 'react'
import type { BotSettings, WorkingHoursDay, PlanKey } from '@/lib/types/database'
import { Save, Clock, MessageSquare } from 'lucide-react'
import UpgradePrompt from '../../components/UpgradePrompt'

interface BotConfigPageClientProps {
	clinicId: string
	initialSettings: BotSettings
	planKey: PlanKey | null
	hasCustomFlows: boolean
}

export default function BotConfigPageClient({
	clinicId,
	initialSettings,
	planKey,
	hasCustomFlows,
}: BotConfigPageClientProps) {
	const [settings, setSettings] = useState<BotSettings>(initialSettings)
	const [isSaving, setIsSaving] = useState(false)
	const [showToast, setShowToast] = useState(false)
	const [toastMessage, setToastMessage] = useState('')
	const [toastType, setToastType] = useState<'success' | 'error'>('success')

	const showNotification = (message: string, type: 'success' | 'error') => {
		setToastMessage(message)
		setToastType(type)
		setShowToast(true)
		setTimeout(() => setShowToast(false), 3000)
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const response = await fetch('/api/bot/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clinicId,
					settings: {
						bot_default_enabled: settings.bot_default_enabled,
						working_hours_enabled: settings.working_hours_enabled,
						working_hours: settings.working_hours,
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
			showNotification('Configurações salvas com sucesso!', 'success')
		} catch (error) {
			console.error('Error saving bot settings:', error)
			showNotification('Erro ao salvar configurações. Tente novamente.', 'error')
		} finally {
			setIsSaving(false)
		}
	}

	const updateWorkingDay = (day: string, field: keyof WorkingHoursDay, value: any) => {
		setSettings({
			...settings,
			working_hours: {
				...settings.working_hours,
				days: settings.working_hours.days.map((d) =>
					d.day === day ? { ...d, [field]: value } : d
				),
			},
		})
	}

	const dayLabels: Record<string, string> = {
		mon: 'Segunda-feira',
		tue: 'Terça-feira',
		wed: 'Quarta-feira',
		thu: 'Quinta-feira',
		fri: 'Sexta-feira',
		sat: 'Sábado',
		sun: 'Domingo',
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
			<div className="mx-auto max-w-5xl">
				{/* Header */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-blue-100 rounded-lg">
						<img src="/brand.png" alt="DoctorChatBot" className="h-6 w-6 object-contain" />
						</div>
						<h1 className="text-3xl font-bold text-slate-800">
							Configurações do Bot
						</h1>
					</div>
					<p className="text-slate-600">
						Personalize o comportamento e as mensagens do bot de atendimento.
					</p>
				</div>

				<div className="space-y-6">
					{/* Bot Behavior Section */}
					<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
						<h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
					<img src="/brand.png" alt="DoctorChatBot" className="h-5 w-5 object-contain" />
							Comportamento do Bot
						</h2>

						<div className="space-y-4">
							{/* Default Enabled Toggle */}
							<div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
								<div className="flex-1">
									<label
										htmlFor="bot-default-enabled"
										className="font-medium text-slate-700 block mb-1"
									>
										Bot ativado por padrão
									</label>
									<p className="text-sm text-slate-500">
										Novas conversas iniciam com o bot automaticamente ativado
									</p>
								</div>
								<button
									id="bot-default-enabled"
									type="button"
									onClick={() =>
										setSettings({
											...settings,
											bot_default_enabled: !settings.bot_default_enabled,
										})
									}
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
										settings.bot_default_enabled
											? 'bg-blue-600'
											: 'bg-slate-300'
									}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
											settings.bot_default_enabled
												? 'translate-x-6'
												: 'translate-x-1'
										}`}
									/>
								</button>
							</div>

							{/* Working Hours Toggle */}
							<div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
								<div className="flex-1">
									<label
										htmlFor="working-hours-enabled"
										className="font-medium text-slate-700 block mb-1"
									>
										Respeitar horário de funcionamento
									</label>
									<p className="text-sm text-slate-500">
										Responder com mensagem especial fora do horário
									</p>
								</div>
								<button
									id="working-hours-enabled"
									type="button"
									onClick={() =>
										setSettings({
											...settings,
											working_hours_enabled: !settings.working_hours_enabled,
										})
									}
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
										settings.working_hours_enabled
											? 'bg-blue-600'
											: 'bg-slate-300'
									}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
											settings.working_hours_enabled
												? 'translate-x-6'
												: 'translate-x-1'
										}`}
									/>
								</button>
							</div>
						</div>
					</div>

					{/* Working Hours Section */}
					{settings.working_hours_enabled && (
						<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
							<h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
								<Clock className="h-5 w-5 text-blue-600" />
								Horário de Funcionamento
							</h2>

							<div className="space-y-3">
								{settings.working_hours.days.map((day) => (
									<div
										key={day.day}
										className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg"
									>
										<input
											type="checkbox"
											checked={day.enabled}
											onChange={(e) =>
												updateWorkingDay(day.day, 'enabled', e.target.checked)
											}
											className="h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
										/>
										<span className="w-32 font-medium text-slate-700">
											{dayLabels[day.day]}
										</span>
										<input
											type="time"
											value={day.start}
											onChange={(e) =>
												updateWorkingDay(day.day, 'start', e.target.value)
											}
											disabled={!day.enabled}
											className="px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
										/>
										<span className="text-slate-500">até</span>
										<input
											type="time"
											value={day.end}
											onChange={(e) =>
												updateWorkingDay(day.day, 'end', e.target.value)
											}
											disabled={!day.enabled}
											className="px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
										/>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Messages Section */}
					<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
						<h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
							<MessageSquare className="h-5 w-5 text-blue-600" />
							Mensagens do Bot
						</h2>

						<div className="space-y-6">
							{/* Welcome Message */}
							<div>
								<label
									htmlFor="message-welcome"
									className="block font-medium text-slate-700 mb-2"
								>
									Mensagem de Boas-vindas
								</label>
								<textarea
									id="message-welcome"
									value={settings.message_welcome}
									onChange={(e) =>
										setSettings({ ...settings, message_welcome: e.target.value })
									}
									rows={2}
									className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
									placeholder="Primeira mensagem quando o paciente entra em contato"
								/>
							</div>

							{/* Menu Message */}
							<div>
								<label
									htmlFor="message-menu"
									className="block font-medium text-slate-700 mb-2"
								>
									Mensagem de Menu
								</label>
								<textarea
									id="message-menu"
									value={settings.message_menu}
									onChange={(e) =>
										setSettings({ ...settings, message_menu: e.target.value })
									}
									rows={4}
									className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
									placeholder="Opções do menu principal"
								/>
							</div>

							{/* Out of Hours Message */}
							<div>
								<label
									htmlFor="message-out-of-hours"
									className="block font-medium text-slate-700 mb-2"
								>
									Mensagem Fora do Horário
								</label>
								<textarea
									id="message-out-of-hours"
									value={settings.message_out_of_hours}
									onChange={(e) =>
										setSettings({
											...settings,
											message_out_of_hours: e.target.value,
										})
									}
									rows={3}
									className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
									placeholder="Mensagem enviada quando paciente entra em contato fora do horário"
								/>
							</div>

							{/* Fallback Message */}
							<div>
								<label
									htmlFor="message-fallback"
									className="block font-medium text-slate-700 mb-2"
								>
									Mensagem de Não Entendimento
								</label>
								<textarea
									id="message-fallback"
									value={settings.message_fallback}
									onChange={(e) =>
										setSettings({ ...settings, message_fallback: e.target.value })
									}
									rows={2}
									className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
									placeholder="Mensagem quando o bot não entende o que o paciente disse"
								/>
							</div>

							{/* Confirmation Messages */}
							<div className="pt-4 border-t border-slate-200">
								<h3 className="font-medium text-slate-700 mb-4">
									Mensagens de Confirmação
								</h3>

								<div className="space-y-4">
									<div>
										<label
											htmlFor="message-confirm-schedule"
											className="block text-sm font-medium text-slate-600 mb-2"
										>
											Confirmar Agendamento
										</label>
										<textarea
											id="message-confirm-schedule"
											value={settings.message_confirm_schedule}
											onChange={(e) =>
												setSettings({
													...settings,
													message_confirm_schedule: e.target.value,
												})
											}
											rows={2}
											className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
										/>
									</div>

									<div>
										<label
											htmlFor="message-confirm-reschedule"
											className="block text-sm font-medium text-slate-600 mb-2"
										>
											Confirmar Remarcação
										</label>
										<textarea
											id="message-confirm-reschedule"
											value={settings.message_confirm_reschedule}
											onChange={(e) =>
												setSettings({
													...settings,
													message_confirm_reschedule: e.target.value,
												})
											}
											rows={2}
											className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
										/>
									</div>

									<div>
										<label
											htmlFor="message-confirm-cancel"
											className="block text-sm font-medium text-slate-600 mb-2"
										>
											Confirmar Cancelamento
										</label>
										<textarea
											id="message-confirm-cancel"
											value={settings.message_confirm_cancel}
											onChange={(e) =>
												setSettings({
													...settings,
													message_confirm_cancel: e.target.value,
												})
											}
											rows={2}
											className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
										/>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Advanced Flows Section (Locked for basic plans) */}
					<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
						<h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
							<MessageSquare className="h-5 w-5 text-blue-600" />
							Fluxos Personalizados Avançados
						</h2>

						{!hasCustomFlows ? (
							<UpgradePrompt
								featureName="Fluxos Personalizados Avançados"
								requiredPlans={['Profissional', 'Clinic Pro']}
								currentPlan={planKey}
								className="mt-4"
							/>
						) : (
							<div className="space-y-4">
								<p className="text-sm text-neutral-600">
									Configure fluxos personalizados de conversação para diferentes cenários.
								</p>
								<div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
									<p className="text-sm text-neutral-500 italic">
										⚙️ Funcionalidade em desenvolvimento - Em breve você poderá criar
										fluxos de conversação totalmente personalizados!
									</p>
								</div>
							</div>
						)}
					</div>

					{/* Save Button */}
					<div className="flex justify-end">
						<button
							onClick={handleSave}
							disabled={isSaving}
							className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
						>
							{isSaving ? (
								<>
									<div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
									Salvando...
								</>
							) : (
								<>
									<Save className="h-4 w-4" />
									Salvar Alterações
								</>
							)}
						</button>
					</div>
				</div>
			</div>

			{/* Toast Notification */}
			{showToast && (
				<div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
					<div
						className={`px-6 py-4 rounded-lg shadow-lg ${
							toastType === 'success'
								? 'bg-green-600 text-white'
								: 'bg-red-600 text-white'
						}`}
					>
						<p className="font-medium">{toastMessage}</p>
					</div>
				</div>
			)}
		</div>
	)
}
