import type {
	Conversation,
	Message,
	MessageDeliveryStatus,
	MessageSender,
	MessageType,
} from '@/lib/types/database'
import { needsHumanAttention } from '@/lib/conversations/mode'

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'failed'

export type OutboxEntry = {
	clientMessageId: string
	conversationId: string
	clinicId?: string
	phone: string
	content: string
	status: OutboxStatus
	attempts: number
	createdAt: string
	updatedAt: string
}

type PartialMessage = Partial<Message> & Pick<Message, 'id' | 'conversation_id' | 'content' | 'sender'>
type PartialConversation = Partial<Conversation> &
	Pick<Conversation, 'id' | 'clinic_id' | 'patient_phone' | 'status' | 'bot_enabled' | 'bot_state' | 'bot_context' | 'created_at' | 'updated_at'>

export function normalizeConversation(value: PartialConversation): Conversation {
	return {
		id: value.id,
		clinic_id: value.clinic_id,
		patient_phone: value.patient_phone,
		patient_name: value.patient_name ?? null,
		cpf: value.cpf ?? null,
		status: value.status,
		bot_enabled: value.bot_enabled,
		bot_state: value.bot_state,
		bot_context: value.bot_context,
		notes: value.notes ?? null,
		profile_picture_url: value.profile_picture_url ?? null,
		last_message_at: value.last_message_at ?? null,
		last_message_preview: value.last_message_preview ?? null,
		last_patient_message_at: value.last_patient_message_at ?? null,
		unread_count: typeof value.unread_count === 'number' ? value.unread_count : 0,
		created_at: value.created_at,
		updated_at: value.updated_at,
	}
}

export function normalizeMessage(value: PartialMessage): Message {
	return {
		id: value.id,
		conversation_id: value.conversation_id,
		sender: value.sender,
		content: value.content,
		zapi_message_id: value.zapi_message_id ?? null,
		client_message_id: value.client_message_id ?? null,
		message_type: (value.message_type ?? 'text') as MessageType,
		delivery_status: (value.delivery_status ?? inferDeliveryStatus(value.sender)) as MessageDeliveryStatus,
		failed_reason: value.failed_reason ?? null,
		metadata: isRecord(value.metadata) ? value.metadata : {},
		created_at: value.created_at ?? new Date().toISOString(),
		updated_at: value.updated_at ?? value.created_at ?? new Date().toISOString(),
	}
}

export function sortConversationsByPriority(conversations: Conversation[]) {
	return [...conversations].sort((left, right) => {
		const leftNeedsHuman = needsHumanAttention(left) && left.status !== 'done'
		const rightNeedsHuman = needsHumanAttention(right) && right.status !== 'done'

		if (leftNeedsHuman && !rightNeedsHuman) return -1
		if (!leftNeedsHuman && rightNeedsHuman) return 1

		if ((left.unread_count ?? 0) !== (right.unread_count ?? 0)) {
			return (right.unread_count ?? 0) - (left.unread_count ?? 0)
		}

		const leftTime = left.last_message_at ? new Date(left.last_message_at).getTime() : 0
		const rightTime = right.last_message_at ? new Date(right.last_message_at).getTime() : 0
		return rightTime - leftTime
	})
}

export function applyConversationChange(
	currentConversations: Conversation[],
	nextConversationLike: PartialConversation | null,
	type: 'INSERT' | 'UPDATE' | 'DELETE',
) {
	if (!nextConversationLike?.id) {
		return currentConversations
	}

	if (type === 'DELETE') {
		return currentConversations.filter((conversation) => conversation.id !== nextConversationLike.id)
	}

	const nextConversation = normalizeConversation(nextConversationLike)
	const currentIndex = currentConversations.findIndex(
		(conversation) => conversation.id === nextConversation.id,
	)

	if (currentIndex === -1) {
		return sortConversationsByPriority([...currentConversations, nextConversation])
	}

	const updated = [...currentConversations]
	updated[currentIndex] = nextConversation
	return sortConversationsByPriority(updated)
}

export function buildOptimisticMessage(entry: OutboxEntry): Message {
	return {
		id: entry.clientMessageId,
		conversation_id: entry.conversationId,
		sender: 'human',
		content: entry.content,
		zapi_message_id: null,
		client_message_id: entry.clientMessageId,
		message_type: 'text',
		delivery_status: entry.status,
		failed_reason: entry.status === 'failed' ? 'Falha ao enviar mensagem' : null,
		metadata: {
			source: 'outbox',
			attempts: entry.attempts,
		},
		created_at: entry.createdAt,
		updated_at: entry.updatedAt,
	}
}

export function mergeMessagesWithOutbox(serverMessages: Message[], outboxEntries: OutboxEntry[]) {
	const serverByClientId = new Set(
		serverMessages
			.map((message) => message.client_message_id)
			.filter((messageId): messageId is string => Boolean(messageId)),
	)

	const optimisticMessages = outboxEntries
		.filter((entry) => !serverByClientId.has(entry.clientMessageId))
		.map(buildOptimisticMessage)

	const merged = [...serverMessages, ...optimisticMessages].sort((left, right) => {
		return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
	})

	return merged
}

export function inferDeliveryStatus(sender: MessageSender): MessageDeliveryStatus {
	return sender === 'patient' ? 'received' : 'sent'
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
