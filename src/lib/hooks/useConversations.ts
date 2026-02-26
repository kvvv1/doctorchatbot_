'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversation } from '@/lib/types/database'
import { hasArrayChanged } from '@/lib/utils/dataComparison'

const POLLING_INTERVAL = 3000 // 3 seconds

interface UseConversationsOptions {
	clinicId: string
	searchQuery?: string
	enabled?: boolean
}

export function useConversations({ clinicId, searchQuery = '', enabled = true }: UseConversationsOptions) {
	const [conversations, setConversations] = useState<Conversation[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const conversationsRef = useRef<Conversation[]>([])
	const intervalRef = useRef<NodeJS.Timeout | null>(null)

	const fetchConversations = async (isInitial = false) => {
		try {
			if (isInitial) setLoading(true)

			const supabase = createClient()
			
			let query = supabase
				.from('conversations')
				.select('*')
				.eq('clinic_id', clinicId)
				.order('last_message_at', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false })

			// Apply search filter if provided
			if (searchQuery.trim()) {
				query = query.or(`patient_name.ilike.%${searchQuery}%,patient_phone.ilike.%${searchQuery}%`)
			}

			const { data, error: fetchError } = await query

			if (fetchError) throw fetchError

			// Only update state if data actually changed
			const changed = hasArrayChanged(conversationsRef.current, data || [], 'updated_at')
			
			if (changed) {
				conversationsRef.current = data || []
				setConversations(data || [])
			}

			if (isInitial) setError(null)
		} catch (err) {
			console.error('Error fetching conversations:', err)
			if (isInitial) {
				setError(err instanceof Error ? err.message : 'Failed to fetch conversations')
			}
		} finally {
			if (isInitial) setLoading(false)
		}
	}

	useEffect(() => {
		if (!enabled) return

		// Initial fetch
		fetchConversations(true)

		// Setup polling
		intervalRef.current = setInterval(() => {
			fetchConversations(false)
		}, POLLING_INTERVAL)

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current)
			}
		}
	}, [clinicId, searchQuery, enabled])

	return {
		conversations,
		loading,
		error,
		refetch: () => fetchConversations(true),
	}
}
