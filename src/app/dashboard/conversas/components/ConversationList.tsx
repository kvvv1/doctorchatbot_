'use client'

import { Search, UserCircle, Bot, MoreVertical } from 'lucide-react'
import type { Conversation } from '@/lib/types/database'
import StatusBadge from './StatusBadge'
import SLAIndicator from './SLAIndicator'
import { format, isToday, isYesterday } from 'date-fns'
import type { ConversationStatusFilter } from '../workspace'
import { normalizeBrazilianPhone } from '@/lib/utils/phone'
import { getConversationMode, needsHumanAttention } from '@/lib/conversations/mode'

interface ConversationListProps {
	conversations: Conversation[]
	selectedId: string | null
	onSelect: (id: string) => void
	searchQuery: string
	onSearchChange: (query: string) => void
	statusFilter: ConversationStatusFilter
	onStatusFilterChange: (status: ConversationStatusFilter) => void
	loading: boolean
	error?: string | null
	showOnlyHumanNeeded: boolean
	onToggleHumanNeeded: () => void
	humanNeededCount: number
}

const STATUS_OPTIONS: Array<{ id: ConversationStatusFilter; label: string }> = [
	{ id: 'all', label: 'Todas' },
	{ id: 'new', label: 'Novas' },
	{ id: 'in_progress', label: 'Em atend.' },
	{ id: 'waiting_patient', label: 'Aguardando' },
	{ id: 'waiting_human', label: 'Humano' },
	{ id: 'scheduled', label: 'Agendadas' },
	{ id: 'done', label: 'Finalizadas' },
]

export default function ConversationList({
	conversations,
	selectedId,
	onSelect,
	searchQuery,
	onSearchChange,
	statusFilter,
	onStatusFilterChange,
	loading,
	error,
	showOnlyHumanNeeded,
	onToggleHumanNeeded,
	humanNeededCount,
}: ConversationListProps) {

	const getInitials = (name: string | null, phone: string) => {
		if (name) {
			const parts = name.trim().split(' ')
			return parts.length >= 2
				? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
				: name.slice(0, 2).toUpperCase()
		}
		return phone.slice(-2)
	}

	const formatTime = (dateString: string | null) => {
		if (!dateString) return ''
		try {
			const date = new Date(dateString)
			if (isToday(date)) return format(date, 'HH:mm')
			if (isYesterday(date)) return 'Ontem'
			return format(date, 'dd/MM')
		} catch { return '' }
	}

	const formatPhone = (phone: string) => {
		const normalizedPhone = normalizeBrazilianPhone(phone) ?? phone.replace(/\D/g, '')

		if (normalizedPhone.length === 11) {
			return `(${normalizedPhone.slice(0, 2)}) ${normalizedPhone.slice(2, 7)}-${normalizedPhone.slice(7)}`
		}

		if (normalizedPhone.length === 10) {
			return `(${normalizedPhone.slice(0, 2)}) ${normalizedPhone.slice(2, 6)}-${normalizedPhone.slice(6)}`
		}

		return phone
	}

	return (
		<div className="flex h-full w-full flex-col bg-white">
			{/* Header estilo WhatsApp Web */}
			<div className="bg-[#f0f2f5] px-4 py-3 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-2.5">
					<div className="size-10 rounded-full bg-sky-600 flex items-center justify-center shrink-0">
						<span className="text-white text-xs font-bold">DC</span>
					</div>
					<span className="text-sm font-semibold text-neutral-800">Conversas</span>
					<span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-neutral-200 px-1.5 text-[11px] font-medium text-neutral-600">
						{conversations.length}
					</span>
				</div>
				<button className="flex items-center justify-center rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-200">
					<MoreVertical className="size-5" />
				</button>
			</div>

			{/* Busca */}
			<div className="bg-[#f0f2f5] px-2 pb-2 shrink-0">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
					<input
						type="text"
						value={searchQuery}
						onChange={e => onSearchChange(e.target.value)}
						placeholder="Buscar conversa..."
						className="w-full rounded-lg bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-sky-400"
					/>
				</div>
			</div>

			{/* Filtros como chips horizontais */}
			<div className="border-b border-neutral-100 bg-white px-2 py-2 shrink-0 overflow-x-auto scrollbar-none">
				<div className="flex gap-1.5 min-w-max">
					{STATUS_OPTIONS.map(opt => (
						<button
							key={opt.id}
							onClick={() => onStatusFilterChange(opt.id)}
							className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
								statusFilter === opt.id
									? 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
									: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
							}`}
						>
							{opt.label}
						</button>
					))}
					{humanNeededCount > 0 && (
						<button
							onClick={onToggleHumanNeeded}
							className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
								showOnlyHumanNeeded
									? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
									: 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
							}`}
						>
							<UserCircle className="size-3" />
							Humano
							<span className={`rounded-full px-1 py-0.5 text-[9px] font-bold leading-none ${
								showOnlyHumanNeeded ? 'bg-amber-500 text-white' : 'bg-neutral-400 text-white'
							}`}>
								{humanNeededCount}
							</span>
						</button>
					)}
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto bg-white">
			{error ? (
				<div className="flex flex-col items-center justify-center p-8 text-center">
					<p className="text-sm font-medium text-red-500">{error}</p>
					<a href="/login" className="mt-2 text-xs text-sky-500 underline">Fazer login novamente</a>
				</div>
			) : loading && conversations.length === 0 ? (
					<div className="flex items-center justify-center p-8">
						<div className="size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-500" />
					</div>
				) : conversations.length === 0 ? (
					<div className="flex flex-col items-center justify-center p-8 text-center">
						<p className="text-sm text-neutral-500">
							{searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa por aqui.'}
						</p>
						{!searchQuery && (
							<p className="mt-1 text-xs text-neutral-400">
								Conecte o WhatsApp para começar a receber mensagens.
							</p>
						)}
					</div>
				) : (
					<div>
						{conversations.map(conversation => {
							const isSelected = conversation.id === selectedId
							const initials = getInitials(conversation.patient_name, conversation.patient_phone)
							const conversationMode = getConversationMode(conversation)
							const requiresHuman = needsHumanAttention(conversation) && conversation.status !== 'done'
							const unreadCount = conversation.unread_count ?? 0
							const hasUnread = unreadCount > 0

							return (
								<button
									key={conversation.id}
									onClick={() => onSelect(conversation.id)}
									className={`group relative w-full border-b border-neutral-100 px-3 py-3 text-left transition-colors ${
										isSelected
											? 'bg-sky-50/50'
											: hasUnread
												? 'bg-sky-50/20 hover:bg-sky-50/40'
												: 'bg-white hover:bg-neutral-50'
									}`}
								>
									<div className="flex items-start gap-3">
										{/* Avatar */}
										<div className="shrink-0">
											{conversation.profile_picture_url ? (
												<img
													src={conversation.profile_picture_url}
													alt={conversation.patient_name || conversation.patient_phone}
													className="size-10 rounded-full object-cover"
													onError={(e) => {
														const target = e.currentTarget
														target.style.display = 'none'
														const fallback = target.nextElementSibling as HTMLElement | null
														if (fallback) fallback.style.display = 'flex'
													}}
												/>
											) : null}
											<div className={`size-10 items-center justify-center rounded-full text-xs font-semibold ${
												isSelected ? 'bg-sky-600 text-white' : 'bg-neutral-200 text-neutral-900'
											}${conversation.profile_picture_url ? ' hidden' : ' flex'}`}>
												{initials}
											</div>
										</div>

										{/* Content */}
										<div className="min-w-0 flex-1">
											<div className="flex items-baseline justify-between gap-2">
												<div className="min-w-0">
													<p className={`truncate text-sm ${requiresHuman || hasUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-900'}`}>
														{conversation.patient_name || 'Sem nome'}
													</p>
													<p className="mt-0.5 truncate text-[11px] text-neutral-500">
														{formatPhone(conversation.patient_phone)}
													</p>
												</div>
												<div className="flex shrink-0 items-center gap-2">
													{conversation.last_message_at && (
														<span className={`text-[11px] ${hasUnread ? 'font-semibold text-sky-600' : 'text-neutral-400'}`}>
															{formatTime(conversation.last_message_at)}
														</span>
													)}
													{hasUnread && (
														<span className="flex min-w-[20px] items-center justify-center rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
															{unreadCount > 99 ? '99+' : unreadCount}
														</span>
													)}
												</div>
											</div>

											<div className="mt-1.5 flex items-center justify-between gap-2">
												<p className={`truncate text-xs ${hasUnread ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>
													{(conversation.last_message_preview && conversation.last_message_preview !== '[Mensagem sem texto]')
														? conversation.last_message_preview
														: 'Sem mensagens ainda'}
												</p>
												<div className="shrink-0 flex items-center gap-1">
													{conversationMode !== 'bot' ? (
														<span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
															<UserCircle className="size-2.5" />
															{conversationMode === 'waiting_human' ? 'FILA HUM.' : 'HUMANO'}
														</span>
													) : (
														<span className="inline-flex items-center gap-0.5 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">
															<Bot className="size-2.5" />
															BOT
														</span>
													)}
													{(conversation.bot_context as { appointmentType?: string } | null)?.appointmentType === 'particular' && (
														<span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
															PART.
														</span>
													)}
													{(conversation.bot_context as { appointmentType?: string } | null)?.appointmentType === 'convenio' && (
														<span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">
															CONV.
														</span>
													)}
													<SLAIndicator
														lastPatientMessageAt={conversation.last_patient_message_at}
														thresholdMinutes={30}
													/>
													<StatusBadge status={conversation.status} size="sm" />
												</div>
											</div>
										</div>
									</div>

									{/* Selected indicator */}
									{isSelected && (
										<div className="absolute left-0 top-0 h-full w-0.5 bg-sky-600" />
									)}

									{/* Human attention indicator */}
									{requiresHuman && !isSelected && (
										<div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-amber-400 to-amber-500" />
									)}
								</button>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
