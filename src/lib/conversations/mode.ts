import type { Conversation, ConversationStatus } from '@/lib/types/database'

export type ConversationMode = 'bot' | 'waiting_human' | 'human'

type ConversationLike = Pick<Conversation, 'status' | 'bot_enabled'>

export function getConversationMode(conversation: ConversationLike | null | undefined): ConversationMode {
  if (!conversation) return 'bot'

  if (conversation.status === 'waiting_human') {
    return 'waiting_human'
  }

  if (conversation.bot_enabled === false) {
    return 'human'
  }

  return 'bot'
}

export function needsHumanAttention(conversation: ConversationLike | null | undefined): boolean {
  const mode = getConversationMode(conversation)
  return mode === 'waiting_human' || mode === 'human'
}

export function canHumanSendMessage(conversation: ConversationLike | null | undefined): boolean {
	if (!conversation) return false
	return getConversationMode(conversation) === 'human'
}

export function getConversationModeLabel(mode: ConversationMode): string {
  switch (mode) {
    case 'waiting_human':
      return 'Aguardando humano'
    case 'human':
      return 'Humano ativo'
    default:
      return 'Bot ativo'
  }
}

export function getConversationFallbackStatus(mode: ConversationMode): ConversationStatus {
  switch (mode) {
    case 'waiting_human':
      return 'waiting_human'
    case 'human':
      return 'in_progress'
    default:
      return 'in_progress'
  }
}
