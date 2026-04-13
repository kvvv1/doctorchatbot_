'use client'

import { useState, useEffect } from 'react'
import { Bell, Clock, MessageSquare, Save, AlertCircle } from 'lucide-react'

interface NotificationSettings {
	id?: string
	clinic_id?: string
	reminder_48h_enabled: boolean
	reminder_24h_enabled: boolean
	reminder_2h_enabled: boolean
	appointment_confirmed_enabled: boolean
	reminder_48h_template: string
	reminder_24h_template: string
	reminder_2h_template: string
	appointment_confirmed_template: string
	reminder_48h_hours_before: number
	reminder_24h_hours_before: number
	reminder_2h_hours_before: number
	created_at?: string
	updated_at?: string
}

const DEFAULT_SETTINGS: NotificationSettings = {
	reminder_48h_enabled: true,
	reminder_24h_enabled: true,
	reminder_2h_enabled: true,
	appointment_confirmed_enabled: true,
	reminder_48h_hours_before: 48,
	reminder_24h_hours_before: 24,
	reminder_2h_hours_before: 2,
	reminder_48h_template: 'Olá {name}! Lembrete: você tem consulta agendada para {day} às {time}. Esperamos por você!',
	reminder_24h_template: 'Oi {name}! Sua consulta é amanhã ({day}) às {time}. Confirme sua presença respondendo esta mensagem.',
	reminder_2h_template: 'Olá {name}! Sua consulta é daqui a 2 horas ({time}). Nos vemos em breve!',
	appointment_confirmed_template: 'Consulta confirmada para {name} no dia {date} às {time}. Obrigado!',
}

export default function NotificationSettingsTab({ clinicId }: { clinicId: string }) {
	const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)

	// Carregar configurações
	useEffect(() => {
		const loadSettings = async () => {
			try {
				setLoading(true)
				const response = await fetch('/api/notifications/settings')
				if (response.ok) {
					const data = await response.json()
					setSettings(data.settings || DEFAULT_SETTINGS)
				}
			} catch (err) {
				console.error('Error loading notification settings:', err)
				setError('Erro ao carregar configurações')
			} finally {
				setLoading(false)
			}
		}
		loadSettings()
	}, [])

	const handleSave = async () => {
		try {
			setSaving(true)
			setError(null)
			setSuccessMessage(null)

			const response = await fetch('/api/notifications/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(settings),
			})

			if (!response.ok) {
				throw new Error('Failed to save settings')
			}

			setSuccessMessage('Configurações salvas com sucesso!')
			setTimeout(() => setSuccessMessage(null), 3000)
		} catch (err) {
			console.error('Error saving notification settings:', err)
			setError('Erro ao salvar configurações. Tente novamente.')
		} finally {
			setSaving(false)
		}
	}

	const updateSetting = <K extends keyof NotificationSettings>(
		key: K,
		value: NotificationSettings[K]
	) => {
		setSettings((prev) => ({ ...prev, [key]: value }))
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-sky-600 border-r-transparent"></div>
					<p className="mt-4 text-sm text-neutral-600">Carregando configurações...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h2 className="text-lg font-semibold text-neutral-900">
					Notificações e Lembretes Automáticos
				</h2>
				<p className="mt-1 text-sm text-neutral-600">
					Configure lembretes automáticos via WhatsApp para seus pacientes. Use as variáveis:{' '}
					<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono text-sky-700">
						{'{name}'}
					</code>,{' '}
					<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono text-sky-700">
						{'{date}'}
					</code>,{' '}
					<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono text-sky-700">
						{'{time}'}
					</code>,{' '}
					<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-mono text-sky-700">
						{'{day}'}
					</code>
				</p>
			</div>

			{/* Error/Success Messages */}
			{error && (
				<div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
					<AlertCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}

			{successMessage && (
				<div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-start gap-3">
					<div className="size-5 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0">
						<svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<p className="text-sm text-green-800">{successMessage}</p>
				</div>
			)}

			{/* Lembrete 48h */}
			<div className="rounded-lg border border-neutral-200 bg-white p-5">
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-blue-100">
							<Clock className="size-5 text-blue-600" />
						</div>
						<div>
							<h3 className="text-sm font-semibold text-neutral-900">
								Lembrete 48 horas antes
							</h3>
							<p className="text-xs text-neutral-600">
								Enviado 2 dias antes da consulta
							</p>
						</div>
					</div>
					<button
						onClick={() => updateSetting('reminder_48h_enabled', !settings.reminder_48h_enabled)}
						className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
							settings.reminder_48h_enabled ? 'bg-sky-600' : 'bg-neutral-300'
						}`}
					>
						<span
							className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
								settings.reminder_48h_enabled ? 'translate-x-6' : 'translate-x-1'
							}`}
						/>
					</button>
				</div>

				{settings.reminder_48h_enabled && (
					<div className="space-y-3">
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1.5">
								Horas antes da consulta
							</label>
							<input
								type="number"
								min="1"
								max="72"
								value={settings.reminder_48h_hours_before}
								onChange={(e) =>
									updateSetting('reminder_48h_hours_before', parseInt(e.target.value) || 48)
								}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							/>
						</div>
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1.5">
								Mensagem do Template
							</label>
							<textarea
								value={settings.reminder_48h_template}
								onChange={(e) => updateSetting('reminder_48h_template', e.target.value)}
								rows={3}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								placeholder="Digite a mensagem do lembrete..."
							/>
						</div>
					</div>
				)}
			</div>

			{/* Lembrete 24h */}
			<div className="rounded-lg border border-neutral-200 bg-white p-5">
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-amber-100">
							<Clock className="size-5 text-amber-600" />
						</div>
						<div>
							<h3 className="text-sm font-semibold text-neutral-900">
								Lembrete 24 horas antes
							</h3>
							<p className="text-xs text-neutral-600">
								Enviado 1 dia antes da consulta
							</p>
						</div>
					</div>
					<button
						onClick={() => updateSetting('reminder_24h_enabled', !settings.reminder_24h_enabled)}
						className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
							settings.reminder_24h_enabled ? 'bg-sky-600' : 'bg-neutral-300'
						}`}
					>
						<span
							className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
								settings.reminder_24h_enabled ? 'translate-x-6' : 'translate-x-1'
							}`}
						/>
					</button>
				</div>

				{settings.reminder_24h_enabled && (
					<div className="space-y-3">
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1.5">
								Horas antes da consulta
							</label>
							<input
								type="number"
								min="1"
								max="48"
								value={settings.reminder_24h_hours_before}
								onChange={(e) =>
									updateSetting('reminder_24h_hours_before', parseInt(e.target.value) || 24)
								}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							/>
						</div>
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1.5">
								Mensagem do Template
							</label>
							<textarea
								value={settings.reminder_24h_template}
								onChange={(e) => updateSetting('reminder_24h_template', e.target.value)}
								rows={3}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								placeholder="Digite a mensagem do lembrete..."
							/>
						</div>
					</div>
				)}
			</div>

			{/* Lembrete 2h */}
			<div className="rounded-lg border border-neutral-200 bg-white p-5">
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-red-100">
							<Clock className="size-5 text-red-600" />
						</div>
						<div>
							<h3 className="text-sm font-semibold text-neutral-900">
								Lembrete 2 horas antes
							</h3>
							<p className="text-xs text-neutral-600">
								Enviado 2 horas antes da consulta
							</p>
						</div>
					</div>
					<button
						onClick={() => updateSetting('reminder_2h_enabled', !settings.reminder_2h_enabled)}
						className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
							settings.reminder_2h_enabled ? 'bg-sky-600' : 'bg-neutral-300'
						}`}
					>
						<span
							className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
								settings.reminder_2h_enabled ? 'translate-x-6' : 'translate-x-1'
							}`}
						/>
					</button>
				</div>

				{settings.reminder_2h_enabled && (
					<div className="space-y-3">
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1.5">
								Horas antes da consulta
							</label>
							<input
								type="number"
								min="0.5"
								max="6"
								step="0.5"
								value={settings.reminder_2h_hours_before}
								onChange={(e) =>
									updateSetting('reminder_2h_hours_before', parseFloat(e.target.value) || 2)
								}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							/>
						</div>
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1.5">
								Mensagem do Template
							</label>
							<textarea
								value={settings.reminder_2h_template}
								onChange={(e) => updateSetting('reminder_2h_template', e.target.value)}
								rows={3}
								className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
								placeholder="Digite a mensagem do lembrete..."
							/>
						</div>
					</div>
				)}
			</div>

			{/* Confirmação de Agendamento */}
			<div className="rounded-lg border border-neutral-200 bg-white p-5">
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-lg bg-green-100">
							<MessageSquare className="size-5 text-green-600" />
						</div>
						<div>
							<h3 className="text-sm font-semibold text-neutral-900">
								Confirmação de Agendamento
							</h3>
							<p className="text-xs text-neutral-600">
								Enviado imediatamente após criar a consulta
							</p>
						</div>
					</div>
					<button
						onClick={() =>
							updateSetting('appointment_confirmed_enabled', !settings.appointment_confirmed_enabled)
						}
						className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
							settings.appointment_confirmed_enabled ? 'bg-sky-600' : 'bg-neutral-300'
						}`}
					>
						<span
							className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
								settings.appointment_confirmed_enabled ? 'translate-x-6' : 'translate-x-1'
							}`}
						/>
					</button>
				</div>

				{settings.appointment_confirmed_enabled && (
					<div>
						<label className="block text-xs font-medium text-neutral-700 mb-1.5">
							Mensagem do Template
						</label>
						<textarea
							value={settings.appointment_confirmed_template}
							onChange={(e) => updateSetting('appointment_confirmed_template', e.target.value)}
							rows={2}
					className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							placeholder="Digite a mensagem de confirmação..."
						/>
					</div>
				)}
			</div>

			{/* Info Box */}
			<div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
				<div className="flex gap-3">
					<Bell className="size-5 text-blue-600 flex-shrink-0 mt-0.5" />
					<div className="text-sm text-blue-900">
						<p className="font-medium mb-1">Como funciona?</p>
						<ul className="text-xs space-y-1 text-blue-800">
							<li>• Lembretes são criados automaticamente ao agendar uma consulta</li>
							<li>• Mensagens são enviadas via WhatsApp nos horários configurados</li>
							<li>• Use as variáveis para personalizar cada mensagem</li>
							<li>
								• O sistema processa lembretes a cada 10 minutos (execução automática via cron job)
							</li>
						</ul>
					</div>
				</div>
			</div>

			{/* Botão Salvar */}
			<div className="flex justify-end pt-2">
				<button
					onClick={handleSave}
					disabled={saving}
					className="flex items-center gap-2 rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Save className="size-4" />
					{saving ? 'Salvando...' : 'Salvar Configurações'}
				</button>
			</div>
		</div>
	)
}
