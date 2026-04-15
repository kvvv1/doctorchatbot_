import { openDB } from 'idb'
import type { Conversation, Message } from '@/lib/types/database'
import type { OutboxEntry } from './model'

type MessageCacheRecord = {
	conversationId: string
	messages: Message[]
	updatedAt: string
}

type ConversationCacheRecord = {
	clinicId: string
	conversations: Conversation[]
	updatedAt: string
}

const DB_NAME = 'doctor-chat-pwa'
const DB_VERSION = 1

function getDb() {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains('outbox')) {
				db.createObjectStore('outbox', { keyPath: 'clientMessageId' })
			}

			if (!db.objectStoreNames.contains('drafts')) {
				db.createObjectStore('drafts', { keyPath: 'conversationId' })
			}

			if (!db.objectStoreNames.contains('message-cache')) {
				db.createObjectStore('message-cache', { keyPath: 'conversationId' })
			}

			if (!db.objectStoreNames.contains('conversation-cache')) {
				db.createObjectStore('conversation-cache', { keyPath: 'clinicId' })
			}
		},
	})
}

export async function listOutboxEntries(conversationId?: string) {
	const db = await getDb()
	const entries = (await db.getAll('outbox')) as OutboxEntry[]
	const filtered = conversationId
		? entries.filter((entry) => entry.conversationId === conversationId)
		: entries

	return filtered.sort((left, right) => {
		return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
	})
}

export async function saveOutboxEntry(entry: OutboxEntry) {
	const db = await getDb()
	await db.put('outbox', entry)
}

export async function removeOutboxEntry(clientMessageId: string) {
	const db = await getDb()
	await db.delete('outbox', clientMessageId)
}

export async function getDraft(conversationId: string) {
	const db = await getDb()
	const result = (await db.get('drafts', conversationId)) as
		| { conversationId: string; content: string; updatedAt: string }
		| undefined

	return result?.content ?? ''
}

export async function setDraft(conversationId: string, content: string) {
	const db = await getDb()

	if (!content) {
		await db.delete('drafts', conversationId)
		return
	}

	await db.put('drafts', {
		conversationId,
		content,
		updatedAt: new Date().toISOString(),
	})
}

export async function getCachedMessages(conversationId: string) {
	const db = await getDb()
	const result = (await db.get('message-cache', conversationId)) as MessageCacheRecord | undefined
	return result?.messages ?? []
}

export async function setCachedMessages(conversationId: string, messages: Message[]) {
	const db = await getDb()
	const record: MessageCacheRecord = {
		conversationId,
		messages,
		updatedAt: new Date().toISOString(),
	}

	await db.put('message-cache', record)
}

export async function getCachedConversations(clinicId: string) {
	const db = await getDb()
	const result = (await db.get('conversation-cache', clinicId)) as
		| ConversationCacheRecord
		| undefined
	return result?.conversations ?? []
}

export async function setCachedConversations(clinicId: string, conversations: Conversation[]) {
	const db = await getDb()
	const record: ConversationCacheRecord = {
		clinicId,
		conversations,
		updatedAt: new Date().toISOString(),
	}

	await db.put('conversation-cache', record)
}
