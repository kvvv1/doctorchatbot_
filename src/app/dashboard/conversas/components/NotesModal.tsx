'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'

interface NotesModalProps {
	isOpen: boolean
	onClose: () => void
	conversationId: string
	initialNotes: string | null
	patientName: string | null
	onSave: (notes: string) => Promise<void>
}

export default function NotesModal({
	isOpen,
	onClose,
	conversationId,
	initialNotes,
	patientName,
	onSave,
}: NotesModalProps) {
	const [notes, setNotes] = useState(initialNotes || '')
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		setNotes(initialNotes || '')
	}, [initialNotes, conversationId])

	if (!isOpen) return null

	const handleSave = async () => {
		setSaving(true)
		try {
			await onSave(notes)
			onClose()
		} catch (error) {
			console.error('Error saving notes:', error)
			alert('Erro ao salvar nota')
		} finally {
			setSaving(false)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') onClose()
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
	}

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Modal */}
			<div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white shadow-xl">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
					<div>
						<h2 className="text-lg font-semibold text-neutral-900">Notas</h2>
						<p className="text-sm text-neutral-500">
							{patientName || 'Paciente'}
						</p>
					</div>
					<button
						onClick={onClose}
						className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Content */}
				<div className="p-6">
					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Adicione observações sobre este paciente..."
						className="h-48 w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
						autoFocus
					/>
					<p className="mt-2 text-xs text-neutral-400">
						Dica: Pressione Ctrl+Enter para salvar
					</p>
				</div>

				{/* Footer */}
				<div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
					<button
						onClick={onClose}
						className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
					>
						Cancelar
					</button>
					<button
						onClick={handleSave}
						disabled={saving}
						className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Save className="size-4" />
						{saving ? 'Salvando...' : 'Salvar'}
					</button>
				</div>
			</div>
		</>
	)
}
