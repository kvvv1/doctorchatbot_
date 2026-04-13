'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversation } from '@/lib/types/database'
import { hasArrayChanged } from '@/lib/utils/dataComparison'

const POLLING_INTERVAL = 20000 // 20 seconds
const IS_LOCAL = process.env.NEXT_PUBLIC_LOCAL_DB === 'sqlite'

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

			let data: Conversation[] | null = null

			if (IS_LOCAL) {
				const params = new URLSearchParams({ clinic_id: clinicId })
				if (searchQuery.trim()) params.set('search', searchQuery)
				const res = await fetch(`/api/local/conversations?${params}`)
				if (!res.ok) throw new Error(await res.text())
				data = await res.json()
			} else {
				const supabase = createClient()

				let query = supabase
					.from('conversations')
					.select('*')
					.eq('clinic_id', clinicId)
					.order('last_message_at', { ascending: false, nullsFirst: false })
					.order('created_at', { ascending: false })

				if (searchQuery.trim()) {
					query = query.or(`patient_name.ilike.%${searchQuery}%,patient_phone.ilike.%${searchQuery}%`)
				}

				const { data: d, error: fetchError } = await query
				if (fetchError) throw fetchError
				data = d
			}

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

		const startPolling = () => {
			if (intervalRef.current) clearInterval(intervalRef.current)
			intervalRef.current = setInterval(() => {
				if (!document.hidden) fetchConversations(false)
			}, POLLING_INTERVAL)
		}

		const handleVisibilityChange = () => {
			if (!document.hidden) {
				fetchConversations(false)
			}
		}

		startPolling()
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
		}
	}, [clinicId, searchQuery, enabled])

	return {
		conversations,
		loading,
		error,
		refetch: () => fetchConversations(true),
	}
}
