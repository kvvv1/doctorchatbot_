'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Search, Save, X, Zap } from 'lucide-react'
import type { QuickReply, QuickReplyCategory } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'

interface QuickRepliesManagerProps {
	clinicId: string
}

const CATEGORY_LABELS: Record<QuickReplyCategory, string> = {
	geral: 'Geral',
	agendamento: 'Agendamento',
	informacoes: 'Informações',
	procedimentos: 'Procedimentos',
	financeiro: 'Financeiro',
	outros: 'Outros',
}

const CATEGORIES: QuickReplyCategory[] = [
	'geral',
	'agendamento',
	'informacoes',
	'procedimentos',
	'financeiro',
	'outros',
]

export default function QuickRepliesManager({ clinicId }: QuickRepliesManagerProps) {
	const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
	const [loading, setLoading] = useState(true)
	const [search, setSearch] = useState('')
	const [editingId, setEditingId] = useState<string | null>(null)
	const [isCreating, setIsCreating] = useState(false)
	const [formData, setFormData] = useState({
		title: '',
		content: '',
		category: 'geral' as QuickReplyCategory,
	})

	useEffect(() => {
		loadQuickReplies()
	}, [clinicId])

	const loadQuickReplies = async () => {
		setLoading(true)
		try {
			const supabase = createClient()
			const { data, error } = await supabase
				.from('quick_replies')
				.select('*')
				.eq('clinic_id', clinicId)
				.order('category', { ascending: true })
				.order('title', { ascending: true })

			if (error) {
				// Silently handle table not existing (migration not run yet)
				// Check for PostgreSQL error code or Supabase schema cache error
				if (
					error.code === '42P01' ||
					error.message?.includes('Could not find the table') ||
					error.message?.includes('schema cache')
				) {
					setQuickReplies([])
					return
				}
				// Log other errors for debugging
				console.error('Error loading quick replies:', error.message)
				setQuickReplies([])
				return
			}
			setQuickReplies(data || [])
		} catch (error) {
			// Only log unexpected errors
			console.error('Unexpected error loading quick replies:', error)
			setQuickReplies([])
		} finally {
			setLoading(false)
		}
	}

	const handleCreate = async () => {
		if (!formData.title.trim() || !formData.content.trim()) return

		// Validate command name (no spaces, lowercase recommended)
		const commandName = formData.title.trim()
		if (/\s/.test(commandName)) {
			alert('O atalho não pode conter espaços. Use apenas letras minúsculas, números ou hífen.')
			return
		}

		try {
			const supabase = createClient()
			const { data, error } = await supabase.from('quick_replies').insert({
				clinic_id: clinicId,
				title: commandName.toLowerCase(),
				content: formData.content,
				category: formData.category,
			})

			if (error) {
				console.error('Error creating quick reply:', error.message)
				alert(`Erro ao criar resposta rápida: ${error.message}`)
				return
			}

			await loadQuickReplies()
			setIsCreating(false)
			setFormData({ title: '', content: '', category: 'geral' })
		} catch (error) {
			console.error('Error creating quick reply:', error)
			alert('Erro ao criar resposta rápida')
		}
	}

	const handleUpdate = async (id: string) => {
		if (!formData.title.trim() || !formData.content.trim()) return

		// Validate command name
		const commandName = formData.title.trim()
		if (/\s/.test(commandName)) {
			alert('O atalho não pode conter espaços. Use apenas letras minúsculas, números ou hífen.')
			return
		}

		try {
			const supabase = createClient()
			const { error } = await supabase
				.from('quick_replies')
				.update({
					title: commandName.toLowerCase(),
					content: formData.content,
					category: formData.category,
					updated_at: new Date().toISOString(),
				})
				.eq('id', id)

			if (error) {
				console.error('Error updating quick reply:', error.message)
				alert(`Erro ao atualizar resposta rápida: ${error.message}`)
				return
			}

			await loadQuickReplies()
			setEditingId(null)
			setFormData({ title: '', content: '', category: 'geral' })
		} catch (error) {
			console.error('Error updating quick reply:', error)
			alert('Erro ao atualizar resposta rápida')
		}
	}

	const handleDelete = async (id: string) => {
		if (!confirm('Tem certeza que deseja excluir esta resposta rápida?')) return

		try {
			const supabase = createClient()
			const { error } = await supabase.from('quick_replies').delete().eq('id', id)

			if (error) {
				console.error('Error deleting quick reply:', error.message)
				alert(`Erro ao excluir resposta rápida: ${error.message}`)
				return
			}

			await loadQuickReplies()
		} catch (error) {
			console.error('Error deleting quick reply:', error)
			alert('Erro ao excluir resposta rápida')
		}
	}

	const startEdit = (qr: QuickReply) => {
		setEditingId(qr.id)
		setFormData({
			title: qr.title,
			content: qr.content,
			category: qr.category,
		})
		setIsCreating(false)
	}

	const cancelEdit = () => {
		setEditingId(null)
		setIsCreating(false)
		setFormData({ title: '', content: '', category: 'geral' })
	}

	const filtered = quickReplies.filter(
		(qr) =>
			qr.title.toLowerCase().includes(search.toLowerCase()) ||
			qr.content.toLowerCase().includes(search.toLowerCase())
	)

	const grouped = filtered.reduce((acc, qr) => {
		if (!acc[qr.category]) acc[qr.category] = []
		acc[qr.category].push(qr)
		return acc
	}, {} as Record<QuickReplyCategory, QuickReply[]>)

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Zap className="size-5 text-amber-500" />
					<div>
						<h2 className="text-lg font-semibold text-neutral-900">Respostas Rápidas</h2>
						<p className="text-xs text-neutral-500">
							Use <span className="font-mono text-amber-600">/atalho</span> no chat para inserir
						</p>
					</div>
				</div>
				<button
					onClick={() => setIsCreating(true)}
					className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
				>
					<Plus className="size-4" />
					Nova Resposta
				</button>
			</div>

			{/* Search */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Buscar respostas..."
				className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
				/>
			</div>

			{/* Create Form */}
			{isCreating && (
				<div className="rounded-lg border border-neutral-200 bg-white p-4">
					<div className="space-y-3">
						<div>
							<label className="mb-1 block text-xs font-medium text-neutral-700">
								Atalho <span className="text-neutral-500">(sem espaços)</span>
							</label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400 font-mono">
									/
								</span>
								<input
									type="text"
									value={formData.title}
									onChange={(e) => setFormData({ ...formData, title: e.target.value.toLowerCase().replace(/\s+/g, '') })}
									placeholder="inicio"
									className="w-full rounded-lg border border-neutral-200 pl-7 pr-3 py-2 text-sm font-mono outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
									autoFocus
								/>
							</div>
							<p className="mt-1 text-xs text-neutral-500">
								Ex: inicio, horario, agendar
							</p>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium text-neutral-700">
								Categoria
							</label>
							<select
								value={formData.category}
								onChange={(e) =>
									setFormData({ ...formData, category: e.target.value as QuickReplyCategory })
								}
								className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
							>
								{CATEGORIES.map((cat) => (
									<option key={cat} value={cat}>
										{CATEGORY_LABELS[cat]}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium text-neutral-700">
								Conteúdo
							</label>
							<textarea
								value={formData.content}
								onChange={(e) => setFormData({ ...formData, content: e.target.value })}
								placeholder="Digite o texto da resposta..."
								rows={3}
								className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<button
								onClick={cancelEdit}
								className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
							>
								Cancelar
							</button>
							<button
								onClick={handleCreate}
								disabled={!formData.title.trim() || !formData.content.trim()}
								className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<Save className="size-4" />
								Salvar
							</button>
						</div>
					</div>
				</div>
			)}

			{/* List */}
			{loading ? (
				<div className="flex items-center justify-center py-12">
					<div className="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-500" />
				</div>
			) : filtered.length === 0 ? (
				<div className="rounded-lg border border-neutral-200 bg-neutral-50 py-12 text-center">
					<Zap className="mx-auto size-8 text-neutral-300" />
					<p className="mt-2 text-sm text-neutral-500">
						{search ? 'Nenhuma resposta encontrada' : 'Nenhuma resposta cadastrada'}
					</p>
				</div>
			) : (
				<div className="space-y-6">
					{CATEGORIES.map((category) => {
						const replies = grouped[category]
						if (!replies || replies.length === 0) return null

						return (
							<div key={category}>
								<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
									{CATEGORY_LABELS[category]}
								</h3>
								<div className="space-y-2">
									{replies.map((qr) => (
										<div
											key={qr.id}
											className="rounded-lg border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
										>
											{editingId === qr.id ? (
												<div className="space-y-3">
													<div>
														<label className="mb-1 block text-xs font-medium text-neutral-700">
															Atalho <span className="text-neutral-500">(sem espaços)</span>
														</label>
														<div className="relative">
															<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400 font-mono">
																/
															</span>
															<input
																type="text"
																value={formData.title}
																onChange={(e) =>
																	setFormData({ ...formData, title: e.target.value.toLowerCase().replace(/\s+/g, '') })
																}
																className="w-full rounded-lg border border-neutral-200 pl-7 pr-3 py-2 text-sm font-mono outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
															/>
														</div>
													</div>
													<div>
														<label className="mb-1 block text-xs font-medium text-neutral-700">
															Categoria
														</label>
														<select
															value={formData.category}
															onChange={(e) =>
																setFormData({
																	...formData,
																	category: e.target.value as QuickReplyCategory,
																})
															}
															className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
														>
															{CATEGORIES.map((cat) => (
																<option key={cat} value={cat}>
																	{CATEGORY_LABELS[cat]}
																</option>
															))}
														</select>
													</div>
													<div>
														<label className="mb-1 block text-xs font-medium text-neutral-700">
															Conteúdo
														</label>
														<textarea
															value={formData.content}
															onChange={(e) =>
																setFormData({ ...formData, content: e.target.value })
															}
															rows={3}
															className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
														/>
													</div>
													<div className="flex justify-end gap-2">
														<button
															onClick={cancelEdit}
															className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
														>
															<X className="size-4" />
														</button>
														<button
															onClick={() => handleUpdate(qr.id)}
															disabled={!formData.title.trim() || !formData.content.trim()}
															className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
														>
															<Save className="size-4" />
														</button>
													</div>
												</div>
											) : (
												<>
													<div className="flex items-start justify-between gap-4">
														<div className="flex-1">
															<div className="flex items-center gap-2">
																<h4 className="font-medium text-neutral-900">{qr.title}</h4>
																<span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
																	/{qr.title}
																</span>
															</div>
															<p className="mt-1 text-sm text-neutral-600">{qr.content}</p>
														</div>
														<div className="flex gap-1">
															<button
																onClick={() => startEdit(qr)}
																className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-sky-600"
																title="Editar"
															>
																<Edit2 className="size-4" />
															</button>
															<button
																onClick={() => handleDelete(qr.id)}
																className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
																title="Excluir"
															>
																<Trash2 className="size-4" />
															</button>
														</div>
													</div>
												</>
											)}
										</div>
									))}
								</div>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
