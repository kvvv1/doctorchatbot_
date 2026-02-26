'use client'

import { useEffect, useRef, useState } from 'react'
import type { Conversation, Message, ConversationStatus } from '@/lib/types/database'
import MessageInput from './MessageInput'
import StatusBadge from './StatusBadge'
import NotesModal from './NotesModal'
import ScheduleModal from './ScheduleModal'
import { isScrolledToBottom } from '@/lib/utils/dataComparison'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, User, UserCircle, ChevronDown, ArrowLeft, Pause, Play, CheckCircle2, MoreVertical, FileText, Download, StickyNote, Calendar } from 'lucide-react'

interface ChatPanelProps {
	conversation: Conversation | null
	messages: Message[]
	loading: boolean
	onSendMessage: (content: string) => Promise<void>
	onUpdateStatus?: (status: ConversationStatus) => void
	onToggleBotEnabled?: (enabled: boolean) => void
	onSaveNotes?: (notes: string) => Promise<void>
	onBack?: () => void
}

const STATUS_ACTIONS: Array<{ status: ConversationStatus; label: string; icon?: any }> = [
	{ status: 'in_progress', label: 'Em atendimento', icon: Play },
	{ status: 'waiting_patient', label: 'Aguardando paciente', icon: Pause },
	{ status: 'scheduled', label: 'Agendado', icon: CheckCircle2 },
	{ status: 'done', label: 'Finalizar', icon: CheckCircle2 },
]

export default function ChatPanel({
	conversation,
	messages,
	loading,
	onSendMessage,
	onUpdateStatus,
	onToggleBotEnabled,
	onSaveNotes,
	onBack,
}: ChatPanelProps) {
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const messagesContainerRef = useRef<HTMLDivElement>(null)
	const wasAtBottomRef = useRef(true)
	const lastMessageCountRef = useRef(0)
	const [showStatusMenu, setShowStatusMenu] = useState(false)
	const [showActionsMenu, setShowActionsMenu] = useState(false)
	const [showNotesModal, setShowNotesModal] = useState(false)
	const [showScheduleModal, setShowScheduleModal] = useState(false)

	// Auto-scroll logic
	useEffect(() => {
		if (!messagesContainerRef.current) return

		const container = messagesContainerRef.current
		const wasAtBottom = isScrolledToBottom(container)
		wasAtBottomRef.current = wasAtBottom

		const isFirstLoad = lastMessageCountRef.current === 0 && messages.length > 0
		
		if (isFirstLoad || wasAtBottom) {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
		}

		lastMessageCountRef.current = messages.length
	}, [messages])

	// Reset on conversation change
	useEffect(() => {
		lastMessageCountRef.current = 0
		wasAtBottomRef.current = true
		messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
	}, [conversation?.id])

	if (!conversation) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-neutral-50">
				<div className="text-center">
					<UserCircle className="mx-auto size-12 text-neutral-300" />
					<p className="mt-3 text-sm text-neutral-500">
						Selecione uma conversa
					</p>
				</div>
			</div>
		)
	}

	const formatMessageTime = (dateString: string) => {
		try {
			return format(new Date(dateString), "HH:mm", { locale: ptBR })
		} catch {
			return ''
		}
	}

	const getSenderIcon = (sender: Message['sender']) => {
		switch (sender) {
			case 'patient':
				return <User className="size-3.5 text-neutral-500" />
			case 'bot':
				return <Bot className="size-3.5 text-indigo-500" />
			case 'human':
				return <UserCircle className="size-3.5 text-sky-500" />
		}
	}

	const getInitials = (name: string | null, phone: string) => {
		if (name) {
			const parts = name.trim().split(' ')
			if (parts.length >= 2) {
				return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
			}
			return name.slice(0, 2).toUpperCase()
		}
		return phone.slice(-2)
	}

	const handleExportHistory = () => {
		if (!conversation) return

		// Criar texto do histórico
		const header = `Histórico de Conversa\n` +
			`Paciente: ${conversation.patient_name || 'Sem nome'}\n` +
			`Telefone: ${conversation.patient_phone}\n` +
			`Status: ${conversation.status}\n` +
			`Data: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n` +
			`${conversation.notes ? `\nNotas:\n${conversation.notes}\n` : ''}\n` +
			`${'='.repeat(50)}\n\n`

		const messagesText = messages.map((msg) => {
			const time = format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
			const sender = msg.sender === 'patient' ? 'Paciente' : msg.sender === 'bot' ? 'Bot' : 'Atendente'
			return `[${time}] ${sender}:\n${msg.content}\n`
		}).join('\n')

		const content = header + messagesText

		// Download do arquivo
		const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = `conversa_${conversation.patient_phone}_${format(new Date(), 'yyyyMMdd_HHmmss')}.txt`
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		URL.revokeObjectURL(url)

		setShowActionsMenu(false)
	}

	const handleSaveNotes = async (notes: string) => {
		if (onSaveNotes) {
			await onSaveNotes(notes)
		}
	}

	const handleSchedule = async (startsAt: string, durationMinutes: number) => {
		if (!conversation) return

		try {
			const response = await fetch('/api/appointments/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					conversationId: conversation.id,
					patientPhone: conversation.patient_phone,
					patientName: conversation.patient_name || 'Sem nome',
					startsAt,
					durationMinutes,
					description: `Consulta agendada via chat`,
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to create appointment')
			}

			const data = await response.json()

			if (data.success) {
				// Show feedback if event was not created
				if (!data.eventCreated && data.eventError) {
					alert(
						`Agendamento criado, mas houve um erro ao criar o evento no Google Calendar: ${data.eventError}`
					)
				}

				// Update status locally
				if (onUpdateStatus) {
					onUpdateStatus('scheduled')
				}
			}
		} catch (error) {
			console.error('Error scheduling:', error)
			throw error
		}
	}

	// Check if conversation needs human attention
	const needsHumanAttention = conversation && !conversation.bot_enabled && conversation.status !== 'done'

	return (
		<div className="flex h-full w-full flex-col bg-white">
			{/* Header/Topbar */}
			<div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5">
				<div className="flex items-center gap-3">
					{/* Mobile back button */}
					{onBack && (
						<button
							onClick={onBack}
							className="md:hidden flex items-center justify-center size-8 rounded-lg hover:bg-neutral-100 transition-colors"
						>
							<ArrowLeft className="size-4 text-neutral-600" />
						</button>
					)}

					{/* Avatar */}
					<div className="flex size-9 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
						{getInitials(conversation.patient_name, conversation.patient_phone)}
					</div>

					{/* Info */}
					<div>
						<h2 className="text-sm font-semibold text-neutral-900">
							{conversation.patient_name || 'Sem nome'}
						</h2>
						<p className="text-xs text-neutral-500">{conversation.patient_phone}</p>
					</div>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2">
					{/* Bot Toggle */}
					<div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5">
						<span className="text-xs font-medium text-neutral-700">Bot</span>
						<button
							onClick={() => onToggleBotEnabled?.(!conversation.bot_enabled)}
							className={`relative h-5 w-9 rounded-full transition-colors ${
								conversation.bot_enabled ? 'bg-green-500' : 'bg-neutral-300'
							}`}
							title={conversation.bot_enabled ? 'Bot ativo' : 'Bot pausado'}
						>
							<div
								className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
									conversation.bot_enabled ? 'translate-x-4' : 'translate-x-0.5'
								}`}
							/>
						</button>
					</div>

					{/* Actions Menu */}
					<div className="relative">
						<button
							onClick={() => setShowActionsMenu(!showActionsMenu)}
							className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50"
							title="Mais ações"
						>
							<MoreVertical className="size-4" />
						</button>

						{showActionsMenu && (
							<>
								<div
									className="fixed inset-0 z-10"
									onClick={() => setShowActionsMenu(false)}
								/>
								<div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
									<button
										onClick={() => {
											setShowScheduleModal(true)
											setShowActionsMenu(false)
										}}
										className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
									>
										<Calendar className="size-4" />
										Agendar consulta
									</button>
									<button
										onClick={() => {
											setShowNotesModal(true)
											setShowActionsMenu(false)
										}}
										className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
									>
										<StickyNote className="size-4" />
										{conversation.notes ? 'Editar nota' : 'Adicionar nota'}
									</button>
									<button
										onClick={handleExportHistory}
										className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
									>
										<Download className="size-4" />
										Exportar histórico
									</button>
								</div>
							</>
						)}
					</div>

					{/* Status dropdown */}
					<div className="relative">
						<button
							onClick={() => setShowStatusMenu(!showStatusMenu)}
							className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
						>
							<StatusBadge status={conversation.status} size="sm" />
							<ChevronDown className={`size-3 text-neutral-400 transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} />
						</button>

						{showStatusMenu && (
							<>
								<div
									className="fixed inset-0 z-10"
									onClick={() => setShowStatusMenu(false)}
								/>
								<div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
									{STATUS_ACTIONS.map((action) => {
										const Icon = action.icon
										return (
											<button
												key={action.status}
												onClick={() => {
													onUpdateStatus?.(action.status)
													setShowStatusMenu(false)
												}}
												className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
											>
												{Icon && <Icon className="size-4" />}
												{action.label}
											</button>
										)
									})}
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Human Attention Warning Banner */}
			{needsHumanAttention && (
				<div className="flex items-center gap-2 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/30 px-4 py-2">
					<UserCircle className="size-4 shrink-0 text-amber-700" />
					<p className="text-xs font-medium text-amber-800">
						Atendimento manual ativo — finalize ou devolva ao bot
					</p>
				</div>
			)}

			{/* Messages */}
			<div
				ref={messagesContainerRef}
				className="flex-1 overflow-y-auto bg-neutral-50 p-4"
			>
				{loading && messages.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<div className="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-500" />
					</div>
				) : messages.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<div className="text-center">
							<p className="text-sm text-neutral-500">Nenhuma mensagem ainda</p>
							<p className="mt-1 text-xs text-neutral-400">Envie a primeira mensagem para começar</p>
						</div>
					</div>
				) : (
					<div className="space-y-2">
						{messages.map((message) => {
							const isFromPatient = message.sender === 'patient'
							return (
								<div
									key={message.id}
									className={`flex items-end gap-2 ${
										isFromPatient ? '' : 'flex-row-reverse'
									}`}
								>
									{/* Avatar Icon - smaller and more subtle */}
									<div className={`mb-1 flex size-6 shrink-0 items-center justify-center rounded-full ${
										isFromPatient ? 'bg-white' : 'bg-sky-500/10'
									} shadow-sm`}>
										{getSenderIcon(message.sender)}
									</div>

									{/* Message Bubble */}
									<div
										className={`flex max-w-[75%] flex-col gap-1 rounded-lg px-3 py-2 shadow-sm ${
											isFromPatient
												? 'bg-white rounded-bl-none'
												: message.sender === 'bot'
												? 'bg-[#dcf8c6] rounded-br-none'
												: 'bg-gradient-to-br from-sky-500 to-indigo-500 text-white rounded-br-none'
										}`}
									>
										<p className={`text-[13px] leading-relaxed ${
											isFromPatient || message.sender === 'bot' ? 'text-neutral-800' : 'text-white'
										}`}>
											{message.content}
										</p>
										<span
											className={`self-end text-[10px] ${
												isFromPatient || message.sender === 'bot'
													? 'text-neutral-400'
													: 'text-sky-100'
											}`}
										>
											{formatMessageTime(message.created_at)}
										</span>
									</div>
								</div>
							)
						})}
						<div ref={messagesEndRef} />
					</div>
				)}
			</div>

			{/* Input */}
			<MessageInput 
				onSend={onSendMessage} 
				disabled={!conversation} 
				clinicId={conversation?.clinic_id}
			/>

			{/* Notes Modal */}
			{conversation && (
				<NotesModal
					isOpen={showNotesModal}
					onClose={() => setShowNotesModal(false)}
					conversationId={conversation.id}
					initialNotes={conversation.notes}
					patientName={conversation.patient_name}
					onSave={handleSaveNotes}
				/>
			)}

			{/* Schedule Modal */}
			{conversation && (
				<ScheduleModal
					isOpen={showScheduleModal}
					onClose={() => setShowScheduleModal(false)}
					conversationId={conversation.id}
					patientPhone={conversation.patient_phone}
					patientName={conversation.patient_name}
					onSchedule={handleSchedule}
				/>
			)}
		</div>
	)
}
