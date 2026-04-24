import type { Conversation } from '@/lib/types/database'
import { normalizePhoneForStorage } from '@/lib/utils/phone'

export function pickCanonicalConversation(
	conversations: Conversation[],
	referenceConversation: Conversation | null,
) {
	if (!referenceConversation) return null

	const normalizedPhone = normalizePhoneForStorage(referenceConversation.patient_phone)
	if (!normalizedPhone) return referenceConversation

	const samePhoneConversations = conversations.filter(
		(conversation) => normalizePhoneForStorage(conversation.patient_phone) === normalizedPhone,
	)

	if (samePhoneConversations.length <= 1) return referenceConversation

	return [...samePhoneConversations].sort((left, right) => {
		const leftLastMessageAt = left.last_message_at ? new Date(left.last_message_at).getTime() : 0
		const rightLastMessageAt = right.last_message_at ? new Date(right.last_message_at).getTime() : 0
		if (rightLastMessageAt !== leftLastMessageAt) return rightLastMessageAt - leftLastMessageAt

		const leftUpdatedAt = left.updated_at ? new Date(left.updated_at).getTime() : 0
		const rightUpdatedAt = right.updated_at ? new Date(right.updated_at).getTime() : 0
		if (rightUpdatedAt !== leftUpdatedAt) return rightUpdatedAt - leftUpdatedAt

		return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
	})[0]
}
