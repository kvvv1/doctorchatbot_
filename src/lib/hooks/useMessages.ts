'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types/database'
import { mergeMessagesWithOutbox, normalizeMessage, type OutboxEntry } from '@/lib/chat/model'
import {
	getCachedMessages,
	listOutboxEntries,
	removeOutboxEntry,
	saveOutboxEntry,
	setCachedMessages,
} from '@/lib/chat/store'

const FALLBACK_REFRESH_INTERVAL = 60000
const IS_LOCAL = process.env.NEXT_PUBLIC_LOCAL_DB === 'sqlite'

interface UseMessagesOptions {
	conversationId: string | null
	phone?: string | null
	enabled?: boolean
	onConversationActivity?: (activity: {
		last_message_at: string
		last_message_preview: string
		unread_count?: number
	}) => void
}

function truncatePreview(content: string, maxLength = 80) {
	return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content
}

async function flushEntry(params: {
	entry: OutboxEntry
	setOutboxEntries: Dispatch<SetStateAction<OutboxEntry[]>>
	onConversationActivity?: UseMessagesOptions['onConversationActivity']
}) {
	const nextSendingEntry: OutboxEntry = {
		...params.entry,
		status: 'sending',
		attempts: params.entry.attempts + 1,
		updatedAt: new Date().toISOString(),
	}

	await saveOutboxEntry(nextSendingEntry)
	params.setOutboxEntries((current) =>
		current.map((entry) =>
			entry.clientMessageId === nextSendingEntry.clientMessageId ? nextSendingEntry : entry,
		),
	)

	try {
		const response = await fetch('/api/zapi/send-text', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				conversationId: nextSendingEntry.conversationId,
				phone: nextSendingEntry.phone,
				text: nextSendingEntry.content,
				clientMessageId: nextSendingEntry.clientMessageId,
			}),
		})

		const result = await response.json()
		if (!response.ok || !result.ok) {
			throw new Error(result.error || 'Falha ao enviar mensagem')
		}

		const sentEntry: OutboxEntry = {
			...nextSendingEntry,
			status: 'sent',
			updatedAt: new Date().toISOString(),
		}

		await saveOutboxEntry(sentEntry)
		params.setOutboxEntries((current) =>
			current.map((entry) =>
				entry.clientMessageId === sentEntry.clientMessageId ? sentEntry : entry,
			),
		)
		params.onConversationActivity?.({
			last_message_at: sentEntry.createdAt,
			last_message_preview: truncatePreview(sentEntry.content),
		})
		return true
	} catch (error) {
		const failedEntry: OutboxEntry = {
			...nextSendingEntry,
			status: 'failed',
			updatedAt: new Date().toISOString(),
		}

		await saveOutboxEntry(failedEntry)
		params.setOutboxEntries((current) =>
			current.map((entry) =>
				entry.clientMessageId === failedEntry.clientMessageId ? failedEntry : entry,
			),
		)
		throw error
	}
}

export function useMessages({
	conversationId,
	phone,
	enabled = true,
	onConversationActivity,
}: UseMessagesOptions) {
	const [serverMessages, setServerMessages] = useState<Message[]>([])
	const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const syncOutbox = useCallback(async () => {
		if (!conversationId) {
			setOutboxEntries([])
			return
		}

		const entries = await listOutboxEntries(conversationId)
		setOutboxEntries(entries)
	}, [conversationId])

	const cleanupAcknowledgedEntries = useCallback(
		async (messagesToCheck: Message[]) => {
			const clientIds = new Set(
				messagesToCheck
					.map((message) => message.client_message_id)
					.filter((clientMessageId): clientMessageId is string => Boolean(clientMessageId)),
			)

			const currentEntries = await listOutboxEntries(conversationId ?? undefined)
			const acknowledgedEntries = currentEntries.filter((entry) =>
				clientIds.has(entry.clientMessageId),
			)

			if (acknowledgedEntries.length === 0) return

			await Promise.all(
				acknowledgedEntries.map((entry) => removeOutboxEntry(entry.clientMessageId)),
			)
			await syncOutbox()
		},
		[conversationId, syncOutbox],
	)

	const fetchMessages = useCallback(
		async (isInitial = false) => {
			if (!conversationId || !enabled) {
				setServerMessages([])
				setLoading(false)
				return
			}

			try {
				if (isInitial) setLoading(true)

				let nextMessages: Message[] = []
				if (IS_LOCAL) {
					const response = await fetch(`/api/local/messages/${conversationId}`, {
						cache: 'no-store',
					})
					if (!response.ok) {
						throw new Error(await response.text())
					}
					nextMessages = ((await response.json()) as Message[]).map(normalizeMessage)
				} else {
					const supabase = createClient()

					// Verify session is valid — refresh if expired
					const {
						data: { session },
						error: sessionError,
					} = await supabase.auth.getSession()

					if (!session || sessionError) {
						const { error: refreshError } = await supabase.auth.refreshSession()
						if (refreshError) {
							throw new Error('Sessao expirada. Por favor, faca login novamente.')
						}
					}

					const { data, error: fetchError } = await supabase
						.from('messages')
						.select('*')
						.eq('conversation_id', conversationId)
						.order('created_at', { ascending: true })

					if (fetchError) throw fetchError
					nextMessages = (data || []).map(normalizeMessage)
				}

				setServerMessages(nextMessages)
				void setCachedMessages(conversationId, nextMessages)
				void cleanupAcknowledgedEntries(nextMessages)
				setError(null)
			} catch (fetchError) {
				console.error('Error fetching messages:', fetchError)

				if (isInitial) {
					const cached = await getCachedMessages(conversationId)
					if (cached.length > 0) {
						setServerMessages(cached.map(normalizeMessage))
						setError(null)
					} else {
						setError(
							fetchError instanceof Error
								? fetchError.message
								: 'Failed to fetch messages',
						)
					}
				}
			} finally {
				if (isInitial) setLoading(false)
			}
		},
		[cleanupAcknowledgedEntries, conversationId, enabled],
	)

	useEffect(() => {
		if (!conversationId || !enabled) {
			setServerMessages([])
			setOutboxEntries([])
			setLoading(false)
			return
		}

		let cancelled = false

		const bootstrap = async () => {
			const [cachedMessages, cachedOutbox] = await Promise.all([
				getCachedMessages(conversationId),
				listOutboxEntries(conversationId),
			])

			if (!cancelled) {
				if (cachedMessages.length > 0) {
					setServerMessages(cachedMessages.map(normalizeMessage))
					setLoading(false)
				}

				setOutboxEntries(cachedOutbox)
			}

			await fetchMessages(true)
			await syncOutbox()
		}

		void bootstrap()

		return () => {
			cancelled = true
		}
	}, [conversationId, enabled, fetchMessages, syncOutbox])

	useEffect(() => {
		if (!conversationId || !enabled || IS_LOCAL) return

		const supabase = createClient()
		const channel = supabase
			.channel(`messages:${conversationId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'messages',
					filter: `conversation_id=eq.${conversationId}`,
				},
				(payload: {
					eventType: 'INSERT' | 'UPDATE' | 'DELETE'
					new: Message
					old: Message
				}) => {
					const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'

					setServerMessages((current) => {
						const next =
							eventType === 'DELETE'
								? current.filter((message) => message.id !== (payload.old as Message).id)
								: current
										.filter((message) => message.id !== (payload.new as Message).id)
										.concat(normalizeMessage(payload.new as Message))
										.sort(
											(left, right) =>
												new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
										)

						void setCachedMessages(conversationId, next)
						void cleanupAcknowledgedEntries(next)
						return next
					})
				},
			)
			.subscribe((status: string) => {
				if (status === 'CHANNEL_ERROR') {
					void fetchMessages(false)
				}
			})

		return () => {
			supabase.removeChannel(channel)
		}
	}, [cleanupAcknowledgedEntries, conversationId, enabled, fetchMessages])

	const flushPendingEntries = useCallback(async () => {
		if (!conversationId || !phone || !navigator.onLine) return

		const entries = await listOutboxEntries(conversationId)
		for (const entry of entries) {
			if (entry.status === 'queued' || entry.status === 'failed') {
				try {
					await flushEntry({
						entry,
						setOutboxEntries,
						onConversationActivity,
					})
				} catch (flushError) {
					console.error('Error flushing outbox entry:', flushError)
				}
			}
		}
	}, [conversationId, onConversationActivity, phone])

	useEffect(() => {
		if (!conversationId || !enabled) return

		const interval = window.setInterval(() => {
			if (!document.hidden) {
				void fetchMessages(false)
				void flushPendingEntries()
			}
		}, FALLBACK_REFRESH_INTERVAL)

		const handleResume = () => {
			if (!document.hidden) {
				void fetchMessages(false)
				void flushPendingEntries()
			}
		}

		window.addEventListener('focus', handleResume)
		window.addEventListener('online', handleResume)
		document.addEventListener('visibilitychange', handleResume)

		return () => {
			window.clearInterval(interval)
			window.removeEventListener('focus', handleResume)
			window.removeEventListener('online', handleResume)
			document.removeEventListener('visibilitychange', handleResume)
		}
	}, [conversationId, enabled, fetchMessages, flushPendingEntries])

	const sendMessage = useCallback(
		async (content: string) => {
			if (!conversationId || !phone) {
				throw new Error('Conversa indisponível para envio')
			}

			const clientMessageId = crypto.randomUUID()
			const now = new Date().toISOString()
			const entry: OutboxEntry = {
				clientMessageId,
				conversationId,
				phone,
				content,
				status: 'queued',
				attempts: 0,
				createdAt: now,
				updatedAt: now,
			}

			await saveOutboxEntry(entry)
			setOutboxEntries((current) => [...current, entry])
			onConversationActivity?.({
				last_message_at: now,
				last_message_preview: truncatePreview(content),
				unread_count: 0,
			})

			if (!navigator.onLine) {
				return { queued: true, clientMessageId }
			}

			await flushEntry({
				entry,
				setOutboxEntries,
				onConversationActivity,
			})

			return { queued: false, clientMessageId }
		},
		[conversationId, onConversationActivity, phone],
	)

	const retryMessage = useCallback(
		async (clientMessageId: string) => {
			const target = outboxEntries.find((entry) => entry.clientMessageId === clientMessageId)
			if (!target) {
				throw new Error('Mensagem pendente não encontrada')
			}

			await flushEntry({
				entry: {
					...target,
					status: 'queued',
					updatedAt: new Date().toISOString(),
				},
				setOutboxEntries,
				onConversationActivity,
			})
		},
		[onConversationActivity, outboxEntries],
	)

	const messages = useMemo(
		() => mergeMessagesWithOutbox(serverMessages, outboxEntries),
		[serverMessages, outboxEntries],
	)

	return {
		messages,
		loading,
		error,
		refetch: () => fetchMessages(true),
		sendMessage,
		retryMessage,
		flushOutbox: flushPendingEntries,
	}
}
