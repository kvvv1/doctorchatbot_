'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types/database'
import { hasArrayChanged } from '@/lib/utils/dataComparison'

const POLLING_INTERVAL = 3000 // 3 seconds

interface UseMessagesOptions {
	conversationId: string | null
	enabled?: boolean
}

export function useMessages({ conversationId, enabled = true }: UseMessagesOptions) {
	const [messages, setMessages] = useState<Message[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const messagesRef = useRef<Message[]>([])
	const intervalRef = useRef<NodeJS.Timeout | null>(null)

	const fetchMessages = async (isInitial = false) => {
		if (!conversationId) {
			setMessages([])
			messagesRef.current = []
			return
		}

		try {
			if (isInitial) setLoading(true)

			const supabase = createClient()
			
			const { data, error: fetchError } = await supabase
				.from('messages')
				.select('*')
				.eq('conversation_id', conversationId)
				.order('created_at', { ascending: true })

			if (fetchError) throw fetchError

			// Only update state if data actually changed
			const changed = hasArrayChanged(messagesRef.current, data || [], 'updated_at')
			
			if (changed) {
				messagesRef.current = data || []
				setMessages(data || [])
			}

			if (isInitial) setError(null)
		} catch (err) {
			console.error('Error fetching messages:', err)
			if (isInitial) {
				setError(err instanceof Error ? err.message : 'Failed to fetch messages')
			}
		} finally {
			if (isInitial) setLoading(false)
		}
	}

	useEffect(() => {
		if (!enabled || !conversationId) {
			setMessages([])
			messagesRef.current = []
			setLoading(false)
			return
		}

		// Initial fetch
		fetchMessages(true)

		// Setup polling
		intervalRef.current = setInterval(() => {
			fetchMessages(false)
		}, POLLING_INTERVAL)

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current)
			}
		}
	}, [conversationId, enabled])

	return {
		messages,
		loading,
		error,
		refetch: () => fetchMessages(true),
	}
}
