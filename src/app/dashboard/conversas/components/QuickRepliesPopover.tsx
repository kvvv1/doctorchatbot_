'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Zap, X, Plus } from 'lucide-react'
import type { QuickReply, QuickReplyCategory } from '@/lib/types/database'

interface QuickRepliesPopoverProps {
	isOpen: boolean
	onClose: () => void
	onSelect: (content: string) => void
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

export default function QuickRepliesPopover({
	isOpen,
	onClose,
	onSelect,
	clinicId,
}: QuickRepliesPopoverProps) {
	const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
	const [search, setSearch] = useState('')
	const [loading, setLoading] = useState(false)
	const popoverRef = useRef<HTMLDivElement>(null)
	const router = useRouter()

	// Load quick replies
	useEffect(() => {
		if (!isOpen || !clinicId) return

		const loadQuickReplies = async () => {
			setLoading(true)
			try {
				const { createClient } = await import('@/lib/supabase/client')
				const supabase = createClient()

				const { data, error } = await supabase
					.from('quick_replies')
					.select('*')
					.eq('clinic_id', clinicId)
					.order('category', { ascending: true })
					.order('title', { ascending: true })

				if (error) {
					// Tabela pode não existir ainda - usar dados de exemplo
					console.warn('Quick replies table not available yet. Run migration 002.')
					setQuickReplies([])
					return
				}
				setQuickReplies(data || [])
			} catch (error) {
				console.error('Error loading quick replies:', error)
				setQuickReplies([])
			} finally {
				setLoading(false)
			}
		}

		loadQuickReplies()
	}, [isOpen, clinicId])

	// Close on click outside
	useEffect(() => {
		if (!isOpen) return

		const handleClickOutside = (e: MouseEvent) => {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				onClose()
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [isOpen, onClose])

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}

		document.addEventListener('keydown', handleEscape)
		return () => document.removeEventListener('keydown', handleEscape)
	}, [isOpen, onClose])

	if (!isOpen) return null

	// Filter quick replies
	const filtered = quickReplies.filter(
		(qr) =>
			qr.title.toLowerCase().includes(search.toLowerCase()) ||
			qr.content.toLowerCase().includes(search.toLowerCase())
	)

	// Group by category
	const grouped = filtered.reduce((acc, qr) => {
		if (!acc[qr.category]) acc[qr.category] = []
		acc[qr.category].push(qr)
		return acc
	}, {} as Record<QuickReplyCategory, QuickReply[]>)

	const handleSelect = (content: string) => {
		onSelect(content)
		onClose()
		setSearch('')
	}

	return (
		<div
			ref={popoverRef}
			className="absolute bottom-full left-0 mb-2 w-full max-w-md rounded-lg border border-neutral-200 bg-white shadow-xl"
			style={{ maxHeight: '400px' }}
		>
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
				<Zap className="size-4 text-amber-500" />
				<span className="text-sm font-semibold text-neutral-900">Respostas Rápidas</span>
				<button
					onClick={() => {
						router.push('/dashboard/configuracoes?tab=respostas-rapidas')
						onClose()
					}}
					className="ml-auto flex size-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
					title="Gerenciar respostas"
				>
					<Plus className="size-4" />
				</button>
				<button
					onClick={onClose}
					className="flex size-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Search */}
			<div className="border-b border-neutral-100 p-2">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Buscar..."
						className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
						autoFocus
					/>
				</div>
			</div>

			{/* Content */}
			<div className="max-h-[300px] overflow-y-auto">
				{loading ? (
					<div className="flex items-center justify-center py-8">
						<div className="size-5 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-500" />
					</div>
				) : filtered.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-sm text-neutral-400">
							{search ? 'Nenhuma resposta encontrada' : 'Nenhuma resposta rápida cadastrada'}
						</p>
					</div>
				) : (
					<div className="py-1">
						{Object.entries(grouped).map(([category, replies]) => (
							<div key={category}>
								{/* Category Header */}
								<div className="px-3 py-1.5">
									<span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
										{CATEGORY_LABELS[category as QuickReplyCategory]}
									</span>
								</div>

								{/* Quick Replies */}
								{replies.map((qr) => (
									<button
										key={qr.id}
										onClick={() => handleSelect(qr.content)}
										className="w-full px-3 py-2 text-left transition-colors hover:bg-sky-50"
									>
										<div className="text-xs font-medium text-neutral-900">{qr.title}</div>
										<div className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">
											{qr.content}
										</div>
									</button>
								))}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
