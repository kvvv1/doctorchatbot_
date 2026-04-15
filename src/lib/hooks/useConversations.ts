'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversation } from '@/lib/types/database'
import {
	applyConversationChange,
	normalizeConversation,
	sortConversationsByPriority,
} from '@/lib/chat/model'
import {
	getCachedConversations,
	setCachedConversations,
} from '@/lib/chat/store'

const FALLBACK_REFRESH_INTERVAL = 90000
const IS_LOCAL = process.env.NEXT_PUBLIC_LOCAL_DB === 'sqlite'

interface UseConversationsOptions {
	clinicId: string
	searchQuery?: string
	enabled?: boolean
}

function filterBySearch(conversations: Conversation[], searchQuery: string) {
	const normalizedSearchQuery = searchQuery.trim().toLowerCase()
	if (!normalizedSearchQuery) return conversations

	return conversations.filter((conversation) => {
		const patientName = conversation.patient_name?.toLowerCase() ?? ''
		const patientPhone = conversation.patient_phone.toLowerCase()
		return (
			patientName.includes(normalizedSearchQuery) ||
			patientPhone.includes(normalizedSearchQuery)
		)
	})
}

export function useConversations({
	clinicId,
	searchQuery = '',
	enabled = true,
}: UseConversationsOptions) {
	const [conversations, setConversations] = useState<Conversation[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const fetchConversations = useCallback(
		async (isInitial = false) => {
			if (!enabled || !clinicId) return

			try {
				if (isInitial) setLoading(true)

				let nextConversations: Conversation[] = []

				if (IS_LOCAL) {
					const params = new URLSearchParams({ clinic_id: clinicId })
					const response = await fetch(`/api/local/conversations?${params}`, {
						cache: 'no-store',
					})

					if (!response.ok) {
						throw new Error(await response.text())
					}

					nextConversations = ((await response.json()) as Conversation[]).map(normalizeConversation)
				} else {
					const supabase = createClient()

					// Verify session is valid — refresh if expired
					const { data: { session }, error: sessionError } = await supabase.auth.getSession()
					if (!session || sessionError) {
						console.warn('[useConversations] No active session, attempting refresh...')
						const { error: refreshError } = await supabase.auth.refreshSession()
						if (refreshError) {
							console.error('[useConversations] Session refresh failed — user must log in again:', refreshError.message)
							setError('Sessão expirada. Por favor, faça login novamente.')
							setLoading(false)
							return
						}
					}

					const { data, error: fetchError } = await supabase
						.from('conversations')
						.select('*')
						.eq('clinic_id', clinicId)
						.order('last_message_at', { ascending: false, nullsFirst: false })
						.order('created_at', { ascending: false })

					if (fetchError) throw fetchError
					nextConversations = (data || []).map(normalizeConversation)
				}

				const sorted = sortConversationsByPriority(nextConversations)
				setConversations(sorted)
				void setCachedConversations(clinicId, sorted)
				setError(null)
			} catch (fetchError) {
				console.error('Error fetching conversations:', fetchError)

				if (isInitial) {
					const cached = await getCachedConversations(clinicId)
					if (cached.length > 0) {
						setConversations(sortConversationsByPriority(cached.map(normalizeConversation)))
						setError(null)
					} else {
						setError(
							fetchError instanceof Error
								? fetchError.message
								: 'Failed to fetch conversations',
						)
					}
				}
			} finally {
				if (isInitial) setLoading(false)
			}
		},
		[clinicId, enabled],
	)

	useEffect(() => {
		if (!enabled || !clinicId) {
			setConversations([])
			setLoading(false)
			return
		}

		let cancelled = false

		const bootstrap = async () => {
			const cached = await getCachedConversations(clinicId)
			if (!cancelled && cached.length > 0) {
				setConversations(sortConversationsByPriority(cached.map(normalizeConversation)))
				setLoading(false)
			}

			await fetchConversations(true)
		}

		void bootstrap()

		return () => {
			cancelled = true
		}
	}, [clinicId, enabled, fetchConversations])

	useEffect(() => {
		if (!enabled || !clinicId || IS_LOCAL) return

		const supabase = createClient()
		const channel = supabase
			.channel(`conversations:${clinicId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'conversations',
					filter: `clinic_id=eq.${clinicId}`,
				},
				(payload: {
					eventType: 'INSERT' | 'UPDATE' | 'DELETE'
					new: Conversation
					old: Conversation
				}) => {
					const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
					const nextLike =
						eventType === 'DELETE'
							? (payload.old as Conversation | null)
							: (payload.new as Conversation | null)

					setConversations((current) => {
						const updated = applyConversationChange(current, nextLike ?? null, eventType)
						void setCachedConversations(clinicId, updated)
						return updated
					})
				},
			)
			.subscribe((status: string) => {
				if (status === 'CHANNEL_ERROR') {
					void fetchConversations(false)
				}
			})

		return () => {
			supabase.removeChannel(channel)
		}
	}, [clinicId, enabled, fetchConversations])

	useEffect(() => {
		if (!enabled || !clinicId) return

		const interval = window.setInterval(() => {
			if (!document.hidden) {
				void fetchConversations(false)
			}
		}, FALLBACK_REFRESH_INTERVAL)

		const handleVisibilityChange = () => {
			if (!document.hidden) {
				void fetchConversations(false)
			}
		}

		window.addEventListener('focus', handleVisibilityChange)
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			window.clearInterval(interval)
			window.removeEventListener('focus', handleVisibilityChange)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
		}
	}, [clinicId, enabled, fetchConversations])

	const updateConversation = useCallback(
		(conversationId: string, patch: Partial<Conversation>) => {
			setConversations((current) => {
				const next = current.map((conversation) =>
					conversation.id === conversationId
						? normalizeConversation({
								...conversation,
								...patch,
								id: conversation.id,
								clinic_id: conversation.clinic_id,
								patient_phone: conversation.patient_phone,
								status: (patch.status ?? conversation.status) as Conversation['status'],
								bot_enabled: patch.bot_enabled ?? conversation.bot_enabled,
								bot_state: patch.bot_state ?? conversation.bot_state,
								bot_context: patch.bot_context ?? conversation.bot_context,
								created_at: conversation.created_at,
								updated_at: patch.updated_at ?? new Date().toISOString(),
							})
						: conversation,
				)

				const sorted = sortConversationsByPriority(next)
				void setCachedConversations(clinicId, sorted)
				return sorted
			})
		},
		[clinicId],
	)

	const markConversationRead = useCallback(
		async (conversationId: string) => {
			updateConversation(conversationId, {
				unread_count: 0,
				updated_at: new Date().toISOString(),
			})

			if (IS_LOCAL) return

			const supabase = createClient()
			const { error: rpcError } = await supabase.rpc('reset_conversation_unread', {
				target_conversation_id: conversationId,
			})

			if (rpcError) {
				const { error: updateError } = await supabase
					.from('conversations')
					.update({
						unread_count: 0,
						updated_at: new Date().toISOString(),
					})
					.eq('id', conversationId)

				if (updateError) {
					console.error('Error marking conversation as read:', updateError)
				}
			}
		},
		[updateConversation],
	)

	const filteredConversations = useMemo(
		() => filterBySearch(conversations, searchQuery),
		[conversations, searchQuery],
	)

	return {
		conversations: filteredConversations,
		allConversations: conversations,
		loading,
		error,
		refetch: () => fetchConversations(true),
		updateConversation,
		markConversationRead,
	}
}
