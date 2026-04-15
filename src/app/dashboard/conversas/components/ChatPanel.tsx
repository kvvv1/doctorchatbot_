'use client'

import { useEffect, useRef, useState } from 'react'
import type {
	Conversation,
	Message,
	ConversationStatus,
	BotState,
} from '@/lib/types/database'
import MessageInput from './MessageInput'
import StatusBadge from './StatusBadge'
import NotesModal from './NotesModal'
import ScheduleModal from './ScheduleModal'
import { isScrolledToBottom } from '@/lib/utils/dataComparison'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
	Bot,
	User,
	UserCircle,
	ChevronDown,
	ArrowLeft,
	CheckCircle2,
	MoreVertical,
	Download,
	StickyNote,
	Calendar,
	ExternalLink,
	Play,
	HandMetal,
	RotateCcw,
	Info,
} from 'lucide-react'
import ConversationContextPanel from './ConversationContextPanel'

interface ChatPanelProps {
	conversation: Conversation | null
	messages: Message[]
	loading: boolean
	onSendMessage: (content: string) => Promise<void>
	onTakeOver: (welcomeMessage?: string) => Promise<void>
	onReturnToBot: () => Promise<void>
	onUpdateStatus?: (status: ConversationStatus) => void
	onSaveNotes?: (notes: string) => Promise<void>
	onBack?: () => void
	draftMessage?: string
	onDraftMessageChange?: (content: string) => void
	onRetryMessage?: (clientMessageId: string) => Promise<void>
}

const STATUS_ACTIONS: Array<{ status: ConversationStatus; label: string }> = [
	{ status: 'in_progress', label: 'Em atendimento' },
	{ status: 'waiting_patient', label: 'Aguardando paciente' },
	{ status: 'scheduled', label: 'Agendado' },
	{ status: 'done', label: 'Finalizar conversa' },
]

const BOT_STATE_LABELS: Record<BotState, string> = {
	menu: 'Menu principal',
	agendar_tipo: 'Tipo de atendimento',
	agendar_convenio: 'Selecionando convênio',
	agendar_nome: 'Coletando nome',
	agendar_cpf: 'Coletando CPF',
	consultar_cpf: 'Localizando por CPF',
	agendar_dia: 'Coletando data',
	agendar_hora: 'Coletando horário',
	agendar_slot_escolha: 'Escolhendo horário',
	agendar_dia_lista: 'Escolhendo data',
	agendar_hora_lista: 'Escolhendo horário',
	agendar_confirmar: 'Confirmando agendamento',
	agendar_alterar_campo: 'Escolhendo o que alterar',
	agendar_alterar_paciente: 'Alterando paciente',
	reagendar_qual: 'Selecionando consulta',
	reagendar_tipo: 'Tipo de atendimento',
	reagendar_dia: 'Remarcando — data',
	reagendar_hora: 'Remarcando — horário',
	reagendar_slot_escolha: 'Escolhendo horário',
	reagendar_dia_lista: 'Remarcando — data',
	reagendar_hora_lista: 'Remarcando — horário',
	cancelar_qual: 'Selecionando consulta',
	cancelar_tipo: 'Tipo de atendimento',
	cancelar_confirmar: 'Confirmando cancelamento',
	cancelar_encaixe: 'Lista de espera',
	atendente: 'Transferido p/ atendente',
	ver_agendamentos: 'Visualizando consultas',
	confirmar_presenca: 'Confirmando presença',
	sem_horario: 'Sem horarios disponiveis',
}

function getDeliveryLabel(message: Message) {
	if (message.sender === 'patient') return null
	switch (message.delivery_status) {
		case 'queued':
			return 'Na fila'
		case 'sending':
			return 'Enviando'
		case 'failed':
			return 'Falhou'
		default:
			return null
	}
}

export default function ChatPanel({
	conversation,
	messages,
	loading,
	onSendMessage,
	onTakeOver,
	onReturnToBot,
	onUpdateStatus,
	onSaveNotes,
	onBack,
	draftMessage,
	onDraftMessageChange,
	onRetryMessage,
}: ChatPanelProps) {
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const messagesContainerRef = useRef<HTMLDivElement>(null)
	const lastMessageCountRef = useRef(0)
	const [showStatusMenu, setShowStatusMenu] = useState(false)
	const [showActionsMenu, setShowActionsMenu] = useState(false)
	const [showNotesModal, setShowNotesModal] = useState(false)
	const [showScheduleModal, setShowScheduleModal] = useState(false)
	const [takingOver, setTakingOver] = useState(false)
	const [showContextPanel, setShowContextPanel] = useState(false)

	useEffect(() => {
		if (!messagesContainerRef.current) return
		const container = messagesContainerRef.current
		const wasAtBottom = isScrolledToBottom(container)
		const isFirstLoad = lastMessageCountRef.current === 0 && messages.length > 0
		if (isFirstLoad || wasAtBottom) {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
		}
		lastMessageCountRef.current = messages.length
	}, [messages])

	useEffect(() => {
		lastMessageCountRef.current = 0
		messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
	}, [conversation?.id])

	if (!conversation) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-neutral-50">
				{loading ? (
					<div className="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-500" />
				) : (
					<div className="text-center">
						<UserCircle className="mx-auto size-12 text-neutral-300" />
						<p className="mt-3 text-sm text-neutral-500">Selecione uma conversa</p>
					</div>
				)}
			</div>
		)
	}

	const formatMessageTime = (dateString: string) => {
		try {
			return format(new Date(dateString), 'HH:mm', { locale: ptBR })
		} catch {
			return ''
		}
	}

	const getSenderIcon = (sender: Message['sender']) => {
		if (sender === 'patient') return <User className="size-3.5 text-neutral-500" />
		if (sender === 'bot') return <Bot className="size-3.5 text-indigo-500" />
		return <UserCircle className="size-3.5 text-sky-500" />
	}

	const getInitials = (name: string | null, phone: string) => {
		if (name) {
			const parts = name.trim().split(' ')
			return parts.length >= 2
				? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
				: name.slice(0, 2).toUpperCase()
		}
		return phone.slice(-2)
	}

	const handleOpenWhatsApp = () => {
		const phone = conversation.patient_phone.replace(/\D/g, '')
		window.open(`https://wa.me/${phone}`, '_blank')
	}

	const handleExportHistory = () => {
		const header =
			`Histórico de Conversa\n` +
			`Paciente: ${conversation.patient_name || 'Sem nome'}\n` +
			`Telefone: ${conversation.patient_phone}\n` +
			`Status: ${conversation.status}\n` +
			`Data: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n` +
			(conversation.notes ? `\nNotas:\n${conversation.notes}\n` : '') +
			`\n${'='.repeat(50)}\n\n`

		const body = messages
			.map((message) => {
				const time = format(new Date(message.created_at), 'dd/MM/yyyy HH:mm', {
					locale: ptBR,
				})
				const sender =
					message.sender === 'patient'
						? 'Paciente'
						: message.sender === 'bot'
							? 'Bot'
							: 'Atendente'
				return `[${time}] ${sender}:\n${message.content}\n`
			})
			.join('\n')

		const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `conversa_${conversation.patient_phone}_${format(new Date(), 'yyyyMMdd_HHmmss')}.txt`
		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
		setShowActionsMenu(false)
	}

	const handleSchedule = async (startsAt: string, durationMinutes: number) => {
		const response = await fetch('/api/appointments/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				conversationId: conversation.id,
				patientPhone: conversation.patient_phone,
				patientName: conversation.patient_name || 'Sem nome',
				startsAt,
				durationMinutes,
				description: 'Consulta agendada via chat',
			}),
		})
		if (!response.ok) throw new Error('Failed to create appointment')
		onUpdateStatus?.('scheduled')
	}

	const handleTakeOver = async () => {
		setTakingOver(true)
		try {
			const welcome = `Olá, ${conversation.patient_name?.split(' ')[0] || ''}! Sou um atendente da clínica e estou aqui para te ajudar. 😊`.trim()
			await onTakeOver(welcome)
		} finally {
			setTakingOver(false)
		}
	}

	const botIsActive = conversation.bot_enabled
	const needsHumanAttention = !botIsActive && conversation.status !== 'done'
	const botStateLabel = BOT_STATE_LABELS[conversation.bot_state] ?? 'Menu principal'

	return (
		<div className="flex h-full w-full flex-col bg-white">
			<div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5">
				<div className="flex items-center gap-3">
					{onBack && (
						<button
							onClick={onBack}
							className="flex size-8 items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors md:hidden"
						>
							<ArrowLeft className="size-4 text-neutral-600" />
						</button>
					)}

					<div className="flex size-9 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
						{getInitials(conversation.patient_name, conversation.patient_phone)}
					</div>

					<div>
						<h2 className="text-sm font-semibold text-neutral-900">
							{conversation.patient_name || 'Sem nome'}
						</h2>
						<div className="mt-0.5 flex items-center gap-1.5">
							<p className="text-xs text-neutral-400">{conversation.patient_phone}</p>
							{botIsActive && (
								<>
									<span className="text-neutral-300">·</span>
									<span className="flex items-center gap-1 text-[10px] font-medium text-indigo-600">
										<Bot className="size-3" />
										{botStateLabel}
									</span>
								</>
							)}
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<button
						onClick={handleOpenWhatsApp}
						className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-green-600"
						title="Abrir no WhatsApp"
					>
						<ExternalLink className="size-4" />
					</button>

					<button
						onClick={() => setShowContextPanel(true)}
						className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 md:hidden"
						title="Abrir contexto da conversa"
					>
						<Info className="size-4" />
					</button>

					{botIsActive ? (
						<button
							onClick={handleTakeOver}
							disabled={takingOver}
							className="hidden items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 md:flex"
							title="Assumir atendimento e desligar bot"
						>
							<HandMetal className="size-3.5" />
							Assumir
						</button>
					) : (
						<button
							onClick={onReturnToBot}
							className="hidden items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 md:flex"
							title="Devolver conversa ao bot"
						>
							<Bot className="size-3.5" />
							Devolver ao bot
						</button>
					)}

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
								<div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
								<div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
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
									{botIsActive ? (
										<button
											onClick={() => {
												void handleTakeOver()
												setShowActionsMenu(false)
											}}
											className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-800 transition-colors hover:bg-amber-50 md:hidden"
										>
											<HandMetal className="size-4" />
											Assumir atendimento
										</button>
									) : (
										<button
											onClick={() => {
												void onReturnToBot()
												setShowActionsMenu(false)
											}}
											className="flex w-full items-center gap-2 px-3 py-2 text-sm text-indigo-700 transition-colors hover:bg-indigo-50 md:hidden"
										>
											<Bot className="size-4" />
											Devolver ao bot
										</button>
									)}
								</div>
							</>
						)}
					</div>

					<div className="relative hidden md:block">
						<button
							onClick={() => setShowStatusMenu(!showStatusMenu)}
							className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
						>
							<StatusBadge status={conversation.status} size="sm" />
							<ChevronDown
								className={`size-3 text-neutral-400 transition-transform ${
									showStatusMenu ? 'rotate-180' : ''
								}`}
							/>
						</button>

						{showStatusMenu && (
							<>
								<div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
								<div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
									{STATUS_ACTIONS.map((action) => (
										<button
											key={action.status}
											onClick={() => {
												onUpdateStatus?.(action.status)
												setShowStatusMenu(false)
											}}
											className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
										>
											{action.status === 'done' ? (
												<CheckCircle2 className="size-4 text-green-500" />
											) : (
												<Play className="size-4 text-neutral-400" />
											)}
											{action.label}
										</button>
									))}
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{needsHumanAttention && (
				<div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
					<div className="flex items-center gap-2">
						<UserCircle className="size-4 shrink-0 text-amber-700" />
						<p className="text-xs font-medium text-amber-800">
							Atendimento manual ativo — bot pausado
						</p>
					</div>
					<button
						onClick={onReturnToBot}
						className="text-[11px] font-semibold text-amber-700 underline hover:text-amber-900"
					>
						Devolver ao bot
					</button>
				</div>
			)}

			<div ref={messagesContainerRef} className="flex-1 overflow-y-auto bg-neutral-50 p-4">
				{loading && messages.length === 0 ? (
					<div className="flex h-full items-center justify-center">
						<div className="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-500" />
					</div>
				) : messages.length === 0 ? (
					<div className="flex h-full items-center justify-center text-center">
						<div>
							<p className="text-sm text-neutral-500">Nenhuma mensagem ainda</p>
							<p className="mt-1 text-xs text-neutral-400">Envie a primeira mensagem para começar</p>
						</div>
					</div>
				) : (
					<div className="space-y-2">
						{messages.map((message) => {
							const isFromPatient = message.sender === 'patient'
							const deliveryLabel = getDeliveryLabel(message)
							return (
								<div
									key={message.id}
									className={`flex items-end gap-2 ${isFromPatient ? '' : 'flex-row-reverse'}`}
								>
									<div
										className={`mb-1 flex size-6 shrink-0 items-center justify-center rounded-full shadow-sm ${
											isFromPatient ? 'bg-white' : 'bg-sky-500/10'
										}`}
									>
										{getSenderIcon(message.sender)}
									</div>

									<div
										className={`flex max-w-[75%] flex-col gap-1 rounded-lg px-3 py-2 shadow-sm ${
											isFromPatient
												? 'rounded-bl-none bg-white'
												: message.sender === 'bot'
													? 'rounded-br-none bg-[#dcf8c6]'
													: 'rounded-br-none bg-gradient-to-br from-sky-500 to-indigo-500 text-white'
										}`}
									>
										<p
											className={`whitespace-pre-wrap text-[13px] leading-relaxed ${
												isFromPatient || message.sender === 'bot'
													? 'text-neutral-800'
													: 'text-white'
											}`}
										>
											{message.content}
										</p>
										<div className="flex items-center justify-end gap-2">
											{deliveryLabel && (
												<span
													className={`text-[10px] md:hidden ${
														message.delivery_status === 'failed'
															? 'text-red-200'
															: 'text-sky-100'
													}`}
												>
													{deliveryLabel}
												</span>
											)}
											<span
												className={`text-[10px] ${
													isFromPatient || message.sender === 'bot'
														? 'text-neutral-400'
														: 'text-sky-100'
												}`}
											>
												{formatMessageTime(message.created_at)}
											</span>
											{message.delivery_status === 'failed' &&
												message.client_message_id &&
												onRetryMessage && (
													<button
														type="button"
														onClick={() => void onRetryMessage(message.client_message_id!)}
														className="rounded-full p-0.5 text-red-200 transition-colors hover:bg-white/10 hover:text-white"
														title="Tentar novamente"
													>
														<RotateCcw className="size-3" />
													</button>
												)}
										</div>
									</div>
								</div>
							)
						})}
						<div ref={messagesEndRef} />
					</div>
				)}
			</div>

			<MessageInput
				onSend={onSendMessage}
				disabled={!conversation}
				clinicId={conversation?.clinic_id}
				value={draftMessage}
				onChange={onDraftMessageChange}
			/>

			<ConversationContextPanel
				conversation={conversation}
				variant="mobile"
				isOpen={showContextPanel}
				onClose={() => setShowContextPanel(false)}
				onOpenNotes={() => {
					setShowContextPanel(false)
					setShowNotesModal(true)
				}}
				onOpenSchedule={() => {
					setShowContextPanel(false)
					setShowScheduleModal(true)
				}}
				onExportHistory={handleExportHistory}
				onOpenWhatsApp={handleOpenWhatsApp}
				onTakeOver={() => void handleTakeOver()}
				onReturnToBot={() => void onReturnToBot()}
			/>

			<NotesModal
				isOpen={showNotesModal}
				onClose={() => setShowNotesModal(false)}
				conversationId={conversation.id}
				initialNotes={conversation.notes}
				patientName={conversation.patient_name}
				onSave={(notes) => onSaveNotes?.(notes) ?? Promise.resolve()}
			/>

			<ScheduleModal
				isOpen={showScheduleModal}
				onClose={() => setShowScheduleModal(false)}
				conversationId={conversation.id}
				patientPhone={conversation.patient_phone}
				patientName={conversation.patient_name}
				onSchedule={handleSchedule}
			/>
		</div>
	)
}
