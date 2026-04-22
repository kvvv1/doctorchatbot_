'use client'

import { X } from 'lucide-react'
import type { Conversation } from '@/lib/types/database'

interface ConversationTabsProps {
	conversations: Conversation[]
	activeId: string | null
	onSelect: (conversationId: string) => void
	onClose: (conversationId: string) => void
}

function getInitials(name: string | null, phone: string) {
	if (name) {
		const parts = name.trim().split(' ')
		return parts.length >= 2
			? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
			: name.slice(0, 2).toUpperCase()
	}

	return phone.slice(-2)
}

export default function ConversationTabs({
	conversations,
	activeId,
	onSelect,
	onClose,
}: ConversationTabsProps) {
	if (conversations.length === 0) return null

	return (
		<div className="border-b border-neutral-200 bg-white px-3 py-2">
			<div
				className="flex items-center gap-2 overflow-x-auto pb-1"
				role="tablist"
				aria-label="Conversas abertas"
			>
				{conversations.map((conversation) => {
					const isActive = conversation.id === activeId
					const patientLabel = conversation.patient_name || conversation.patient_phone

					return (
						<div
							key={conversation.id}
							role="presentation"
							className={`group flex min-w-0 max-w-[240px] items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
								isActive
									? 'border-sky-200 bg-sky-50 text-sky-800 shadow-sm'
									: 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50'
							}`}
						>
							<button
								type="button"
								role="tab"
								aria-selected={isActive}
								title={patientLabel}
								onClick={() => onSelect(conversation.id)}
								className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
							>
								<div
									className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
										isActive
											? 'bg-sky-600 text-white'
											: 'bg-neutral-200 text-neutral-900'
									}`}
								>
									{getInitials(conversation.patient_name, conversation.patient_phone)}
								</div>
								<div className="min-w-0">
									<p className="truncate text-xs font-semibold">{patientLabel}</p>
								</div>
							</button>

							<button
								type="button"
								onClick={() => onClose(conversation.id)}
								className={`flex size-6 shrink-0 items-center justify-center rounded-md transition-colors ${
									isActive
										? 'text-sky-500 hover:bg-sky-100 hover:text-sky-700'
										: 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900'
								}`}
								aria-label={`Fechar aba de ${patientLabel}`}
								title={`Fechar ${patientLabel}`}
							>
								<X className="size-3.5" />
							</button>
						</div>
					)
				})}
			</div>
		</div>
	)
}
