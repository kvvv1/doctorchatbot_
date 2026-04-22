'use client'

import { useState } from 'react'
import { X, Calendar, Clock } from 'lucide-react'

interface ScheduleModalProps {
	isOpen: boolean
	onClose: () => void
	conversationId: string
	patientPhone: string
	patientName: string | null
	onSchedule: (startsAt: string, durationMinutes: number) => Promise<void>
}

export default function ScheduleModal({
	isOpen,
	onClose,
	conversationId,
	patientPhone,
	patientName,
	onSchedule,
}: ScheduleModalProps) {
	const [date, setDate] = useState('')
	const [time, setTime] = useState('')
	const [duration, setDuration] = useState(30)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	if (!isOpen) return null

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)

		if (!date || !time) {
			setError('Por favor, preencha data e hora')
			return
		}

		// Validate date is not in the past
		const selectedDateTime = new Date(`${date}T${time}`)
		if (selectedDateTime < new Date()) {
			setError('A data e hora devem ser no futuro')
			return
		}

		setSaving(true)

		try {
			await onSchedule(selectedDateTime.toISOString(), duration)
			onClose()
			// Reset form
			setDate('')
			setTime('')
			setDuration(30)
		} catch (err) {
			console.error('Error scheduling:', err)
			setError('Erro ao criar agendamento. Tente novamente.')
		} finally {
			setSaving(false)
		}
	}

	const handleClose = () => {
		if (!saving) {
			setDate('')
			setTime('')
			setDuration(30)
			setError(null)
			onClose()
		}
	}

	// Get min date (today)
	const today = new Date().toISOString().split('T')[0]

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50"
				onClick={handleClose}
			/>

			{/* Modal */}
			<div className="relative z-10 w-full max-w-md rounded-lg bg-white shadow-xl mx-4">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
					<h2 className="text-lg font-semibold text-neutral-900">
						Agendar Consulta
					</h2>
					<button
						onClick={handleClose}
						disabled={saving}
						className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Content */}
				<form onSubmit={handleSubmit} className="p-6 space-y-4">
					{/* Patient Info */}
					<div className="rounded-lg bg-neutral-50 p-3">
						<p className="text-sm font-medium text-neutral-900">
							{patientName || 'Sem nome'}
						</p>
						<p className="text-xs text-neutral-500">{patientPhone}</p>
					</div>

					{/* Date */}
					<div>
						<label className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-900">
							<Calendar className="size-4" />
							Data
						</label>
						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							min={today}
							required
							disabled={saving}
							className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-neutral-100 disabled:cursor-not-allowed"
						/>
					</div>

					{/* Time */}
					<div>
						<label className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-900">
							<Clock className="size-4" />
							Horário
						</label>
						<input
							type="time"
							value={time}
							onChange={(e) => setTime(e.target.value)}
							required
							disabled={saving}
							className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-neutral-100 disabled:cursor-not-allowed"
						/>
					</div>

					{/* Duration */}
					<div>
						<label className="mb-2 block text-sm font-medium text-neutral-900">
							Duração
						</label>
						<select
							value={duration}
							onChange={(e) => setDuration(Number(e.target.value))}
							disabled={saving}
							className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-neutral-100 disabled:cursor-not-allowed"
						>
							<option value={15}>15 minutos</option>
							<option value={30}>30 minutos</option>
							<option value={45}>45 minutos</option>
							<option value={60}>1 hora</option>
							<option value={90}>1h 30min</option>
							<option value={120}>2 horas</option>
						</select>
					</div>

					{/* Error Message */}
					{error && (
						<div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
							{error}
						</div>
					)}

					{/* Info */}
					<div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
						<p>
							Ao confirmar, a conversa será marcada como "Agendado" e um evento
							será criado no Google Calendar (se configurado).
						</p>
					</div>

					{/* Actions */}
					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={handleClose}
							disabled={saving}
							className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Cancelar
						</button>
						<button
							type="submit"
							disabled={saving}
							className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{saving ? 'Agendando...' : 'Confirmar'}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}
