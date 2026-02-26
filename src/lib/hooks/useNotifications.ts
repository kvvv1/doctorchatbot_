/**
 * Hook: useNotifications
 * Manage in-app notifications
 */

'use client'

import { useState, useEffect } from 'react'
import type { Notification } from '@/lib/types/notifications'

export function useNotifications() {
	const [notifications, setNotifications] = useState<Notification[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Fetch notifications
	const fetchNotifications = async () => {
		try {
			setLoading(true)
			const response = await fetch('/api/notifications')

			if (!response.ok) {
				throw new Error('Failed to fetch notifications')
			}

			const data = await response.json()
			setNotifications(data.notifications || [])
			setError(null)
		} catch (err) {
			console.error('Error fetching notifications:', err)
			setError(err instanceof Error ? err.message : 'Unknown error')
		} finally {
			setLoading(false)
		}
	}

	// Mark notification as read
	const markAsRead = async (notificationId: string) => {
		try {
			const response = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notificationId }),
			})

			if (!response.ok) {
				throw new Error('Failed to mark notification as read')
			}

			// Update local state
			setNotifications((prev) =>
				prev.filter((n) => n.id !== notificationId)
			)
		} catch (err) {
			console.error('Error marking notification as read:', err)
			throw err
		}
	}

	// Mark all as read
	const markAllAsRead = async () => {
		try {
			const response = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markAllAsRead: true }),
			})

			if (!response.ok) {
				throw new Error('Failed to mark all as read')
			}

			// Clear local state
			setNotifications([])
		} catch (err) {
			console.error('Error marking all as read:', err)
			throw err
		}
	}

	// Fetch on mount
	useEffect(() => {
		fetchNotifications()
	}, [])

	// Poll for new notifications every 30 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			fetchNotifications()
		}, 30000)

		return () => clearInterval(interval)
	}, [])

	return {
		notifications,
		loading,
		error,
		unreadCount: notifications.length,
		markAsRead,
		markAllAsRead,
		refresh: fetchNotifications,
	}
}
