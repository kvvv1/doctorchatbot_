'use client'

import { Search, ChevronDown, UserCircle, Bot } from 'lucide-react'
import type { Conversation } from '@/lib/types/database'
import StatusBadge from './StatusBadge'
import SLAIndicator from './SLAIndicator'
import { format, isToday, isYesterday } from 'date-fns'
import { useState } from 'react'
import type { ConversationStatusFilter } from '../workspace'

interface ConversationListProps {
	conversations: Conversation[]
	selectedId: string | null
	onSelect: (id: string) => void
	searchQuery: string
	onSearchChange: (query: string) => void
	statusFilter: ConversationStatusFilter
	onStatusFilterChange: (status: ConversationStatusFilter) => void
	loading: boolean
	showOnlyHumanNeeded: boolean
	onToggleHumanNeeded: () => void
	humanNeededCount: number
}

const STATUS_OPTIONS: Array<{ id: ConversationStatusFilter; label: string }> = [
	{ id: 'all', label: 'Todas' },
	{ id: 'new', label: 'Novas' },
	{ id: 'in_progress', label: 'Em atendimento' },
	{ id: 'waiting_patient', label: 'Aguardando' },
	{ id: 'waiting_human', label: 'Aguardando humano' },
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
	showOnlyHumanNeeded,
	onToggleHumanNeeded,
	humanNeededCount,
}: ConversationListProps) {
	const [showStatusMenu, setShowStatusMenu] = useState(false)

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

	const getStatusLabel = (status: ConversationStatusFilter) =>
		STATUS_OPTIONS.find(opt => opt.id === status)?.label || 'Todas'

	return (
		<div className="flex h-full w-full flex-col bg-white">
			{/* Header */}
			<div className="border-b border-neutral-200 bg-white px-4 py-2.5">
				<div className="flex items-center gap-2">
					<h2 className="text-base font-semibold text-neutral-900">Conversas</h2>
					<span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-neutral-100 px-1.5 text-[11px] font-medium text-neutral-600">
						{conversations.length}
					</span>
				</div>
			</div>

			{/* Search & Filter */}
			<div className="border-b border-neutral-200 bg-white px-3 py-2.5 space-y-2">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
					<input
						type="text"
						value={searchQuery}
						onChange={e => onSearchChange(e.target.value)}
						placeholder="Buscar conversa..."
						className="w-full rounded-lg border border-neutral-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
					/>
				</div>

				{/* Status dropdown */}
				<div className="relative">
					<button
						onClick={() => setShowStatusMenu(!showStatusMenu)}
						className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
					>
						<span className="text-xs font-medium">
							Status: <span className="font-semibold">{getStatusLabel(statusFilter)}</span>
						</span>
						<ChevronDown className={`size-3.5 text-neutral-400 transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} />
					</button>

					{showStatusMenu && (
						<>
							<div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
							<div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
								{STATUS_OPTIONS.map(option => (
									<button
										key={option.id}
										onClick={() => { onStatusFilterChange(option.id); setShowStatusMenu(false) }}
										className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
											statusFilter === option.id
												? 'bg-sky-50 text-sky-700 font-medium'
												: 'text-neutral-700 hover:bg-neutral-50'
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						</>
					)}
				</div>

				{/* Human attention filter */}
				{humanNeededCount > 0 && (
					<button
						onClick={onToggleHumanNeeded}
						className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
							showOnlyHumanNeeded
								? 'bg-amber-50 border-amber-300 text-amber-800 shadow-sm'
								: 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
						}`}
					>
						<div className="flex items-center gap-1.5">
							<UserCircle className={`size-3.5 ${showOnlyHumanNeeded ? 'text-amber-600' : 'text-neutral-500'}`} />
							<span>Pendências humanas</span>
						</div>
						<span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
							showOnlyHumanNeeded ? 'bg-amber-200 text-amber-900' : 'bg-neutral-100 text-neutral-600'
						}`}>
							{humanNeededCount}
						</span>
					</button>
				)}
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto bg-white">
				{loading && conversations.length === 0 ? (
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
							const needsHumanAttention = !conversation.bot_enabled && conversation.status !== 'done'
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
											<div className={`flex size-10 items-center justify-center rounded-full text-xs font-semibold ${
												isSelected ? 'bg-sky-600 text-white' : 'bg-neutral-200 text-neutral-600'
											}`}>
												{initials}
											</div>
										</div>

										{/* Content */}
										<div className="min-w-0 flex-1">
											<div className="flex items-baseline justify-between gap-2">
												<p className={`truncate text-sm ${needsHumanAttention || hasUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
													{conversation.patient_name || conversation.patient_phone}
												</p>
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

											<div className="flex items-center justify-between gap-2 mt-1">
												{conversation.last_message_preview && (
													<p className={`truncate text-xs ${hasUnread ? 'font-medium text-neutral-700' : 'text-neutral-500'}`}>
														{conversation.last_message_preview}
													</p>
												)}
												<div className="shrink-0 flex items-center gap-1">
													{needsHumanAttention ? (
														<span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
															<UserCircle className="size-2.5" />
															HUMANO
														</span>
													) : conversation.bot_enabled && (
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
									{needsHumanAttention && !isSelected && (
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
