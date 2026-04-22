'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Zap, HandMetal, AlertCircle } from 'lucide-react'
import QuickRepliesPopover from './QuickRepliesPopover'
import type { QuickReply } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'

interface MessageInputProps {
	onSend: (content: string) => Promise<void>
	disabled?: boolean
	clinicId?: string
	value?: string
	onChange?: (content: string) => void
	waitingHuman?: boolean
	onTakeOver?: () => void
}

export default function MessageInput({
	onSend,
	disabled = false,
	clinicId,
	value,
	onChange,
	waitingHuman = false,
	onTakeOver,
}: MessageInputProps) {
	const [internalContent, setInternalContent] = useState('')
	const [sending, setSending] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showQuickReplies, setShowQuickReplies] = useState(false)
	const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
	const [showAutocomplete, setShowAutocomplete] = useState(false)
	const [autocompleteQuery, setAutocompleteQuery] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const autocompleteRef = useRef<HTMLDivElement>(null)
	const isControlled = value !== undefined
	const content = isControlled ? value : internalContent

	const setContent = (nextContent: string) => {
		if (isControlled) {
			onChange?.(nextContent)
			return
		}

		setInternalContent(nextContent)
	}

	// Load quick replies for autocomplete
	useEffect(() => {
		if (!clinicId) return

		const loadQuickReplies = async () => {
			try {
				const supabase = createClient()
				const { data, error } = await supabase
					.from('quick_replies')
					.select('*')
					.eq('clinic_id', clinicId)
					.order('title', { ascending: true })

				if (error) {
					setQuickReplies([])
					return
				}
				setQuickReplies(data || [])
			} catch (error) {
				console.error('Error loading quick replies:', error)
				setQuickReplies([])
			}
		}

		loadQuickReplies()
	}, [clinicId])

	// Auto-resize textarea
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto'
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
		}
	}, [content])

	// Detect "/" commands for autocomplete
	useEffect(() => {
		const lastWord = content.split(/\s/).pop() || ''
		
		if (lastWord.startsWith('/') && lastWord.length > 1) {
			const query = lastWord.slice(1).toLowerCase()
			setAutocompleteQuery(query)
			setShowAutocomplete(true)
			setSelectedIndex(0)
		} else if (lastWord === '/') {
			// Show all commands when just "/" is typed
			setAutocompleteQuery('')
			setShowAutocomplete(true)
			setSelectedIndex(0)
		} else {
			setShowAutocomplete(false)
		}
	}, [content])

	// Filter quick replies based on command
	const filteredReplies = autocompleteQuery === ''
		? quickReplies.slice(0, 8) // Show first 8 when no query
		: quickReplies.filter((qr) => {
				const searchText = `/${qr.title.toLowerCase().replace(/\s+/g, '')}`
				return searchText.includes(autocompleteQuery.toLowerCase())
		  }).slice(0, 5) // Max 5 when filtering

	// Close autocomplete on click outside
	useEffect(() => {
		if (!showAutocomplete) return

		const handleClickOutside = (e: MouseEvent) => {
			if (
				autocompleteRef.current &&
				!autocompleteRef.current.contains(e.target as Node) &&
				!textareaRef.current?.contains(e.target as Node)
			) {
				setShowAutocomplete(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [showAutocomplete])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		await submitCurrentContent()
	}

	const submitCurrentContent = async () => {
		const trimmed = content.trim()
		if (!trimmed || sending || disabled) return

		setError(null)
		setSending(true)

		try {
			await onSend(trimmed)
			setContent('')
		} catch (error) {
			console.error('Error sending message:', error)
			const errorMessage = error instanceof Error ? error.message : 'Falha ao enviar mensagem'
			setError(errorMessage)
		} finally {
			setSending(false)
		}
	}

	const selectQuickReply = (qr: QuickReply) => {
		// Replace the last word (command) with the quick reply content
		const words = content.split(/\s/)
		words.pop() // Remove the command
		const newContent = words.length > 0 
			? words.join(' ') + ' ' + qr.content 
			: qr.content
		
		setContent(newContent)
		setShowAutocomplete(false)
		textareaRef.current?.focus()
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Handle autocomplete navigation
		if (showAutocomplete && filteredReplies.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedIndex((prev) => (prev + 1) % filteredReplies.length)
				return
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedIndex((prev) => (prev - 1 + filteredReplies.length) % filteredReplies.length)
				return
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault()
				selectQuickReply(filteredReplies[selectedIndex])
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				setShowAutocomplete(false)
				return
			}
		}

		// Normal enter to send
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			void submitCurrentContent()
		}
	}

	const handleQuickReplySelect = (text: string) => {
		setContent(text)
		textareaRef.current?.focus()
	}

	return (
		<div className="relative">
			{/* Autocomplete Menu */}
			{showAutocomplete && filteredReplies.length > 0 && (
				<div
					ref={autocompleteRef}
					className="absolute bottom-full left-0 mb-2 w-full max-w-md rounded-lg border border-neutral-200 bg-white shadow-lg"
				>
					<div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
						<p className="text-xs font-medium text-neutral-900">
							<Zap className="inline size-3 text-amber-500 mr-1" />
							Atalhos de Respostas
						</p>
						<p className="text-xs text-neutral-500">
							↑↓ Enter/Tab
						</p>
					</div>
					<div className="max-h-64 overflow-y-auto py-1">
						{filteredReplies.map((qr, index) => {
							const commandName = qr.title.toLowerCase().replace(/\s+/g, '')
							return (
								<button
									key={qr.id}
									onClick={() => selectQuickReply(qr)}
									className={`flex w-full items-start gap-3 px-3 py-2 text-left transition-colors ${
										index === selectedIndex
											? 'bg-sky-50'
											: 'hover:bg-neutral-50'
									}`}
								>
									<div className="flex-shrink-0 rounded bg-amber-100 px-2 py-0.5 mt-0.5">
										<span className="text-xs font-mono font-semibold text-amber-700">
											/{commandName}
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-neutral-900">{qr.title}</div>
										<div className="text-xs text-neutral-500 line-clamp-2 mt-0.5">
											{qr.content}
										</div>
									</div>
								</button>
							)
						})}
					</div>
				</div>
			)}

			<QuickRepliesPopover
				isOpen={showQuickReplies}
				onClose={() => setShowQuickReplies(false)}
				onSelect={handleQuickReplySelect}
				clinicId={clinicId || ''}
			/>

			{/* Error Message */}
			{error && (
				<div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
					<AlertCircle className="size-4 flex-shrink-0" />
					<span className="flex-1">{error}</span>
					<button
						onClick={() => setError(null)}
						className="text-red-500 hover:text-red-700 text-xs font-medium"
					>
						Fechar
					</button>
				</div>
			)}
			
			<form
				onSubmit={handleSubmit}
				className="flex items-end gap-2 border-t border-neutral-200 bg-white px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]"
			>
				{waitingHuman ? (
					// Banner blocking input — secretary must click Assumir first
					<div className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 gap-3">
						<p className="text-sm text-amber-800 font-medium leading-snug">
							Aguardando atendente assumir o chat.
						</p>
						<button
							type="button"
							onClick={onTakeOver}
							className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
						>
							<HandMetal className="size-3.5" />
							Assumir
						</button>
					</div>
				) : (
					<>
						{/* Quick Replies Button */}
						{clinicId && (
							<button
								type="button"
								onClick={() => setShowQuickReplies(!showQuickReplies)}
								disabled={disabled}
								className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-amber-500 transition-colors hover:bg-amber-50 hover:border-amber-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
								title="Respostas rápidas"
							>
								<Zap className="size-4" />
							</button>
						)}

						<textarea
							ref={textareaRef}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Mensagem... (Digite / para atalhos)"
							disabled={disabled || sending}
							rows={1}
							className="flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:bg-neutral-50 disabled:text-neutral-400"
							style={{
								minHeight: '38px',
								maxHeight: '120px',
							}}
						/>
						<button
							type="submit"
							disabled={!content.trim() || sending || disabled}
							className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white transition-colors hover:bg-sky-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{sending ? (
								<div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
							) : (
								<Send className="size-4" />
							)}
						</button>
					</>
				)}
			</form>
		</div>
	)
}
