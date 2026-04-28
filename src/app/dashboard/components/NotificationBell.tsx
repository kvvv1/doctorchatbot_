/**
 * Component: NotificationBell
 * Shows unread notifications with a bell icon
 */

'use client'

import { useState } from 'react'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useNotifications } from '@/lib/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function NotificationBell() {
	const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
	const [isOpen, setIsOpen] = useState(false)

	const handleMarkAsRead = async (notificationId: string) => {
		try {
			await markAsRead(notificationId)
		} catch (error) {
			console.error('Error marking as read:', error)
		}
	}

	const handleMarkAllAsRead = async () => {
		try {
			await markAllAsRead()
			setIsOpen(false)
		} catch (error) {
			console.error('Error marking all as read:', error)
		}
	}

	return (
		<div className="relative">
			{/* Bell Button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
				aria-label="Notificações"
			>
				<Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
				{unreadCount > 0 && (
					<span className="absolute top-0 right-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
						{unreadCount > 9 ? '9+' : unreadCount}
					</span>
				)}
			</button>

			{/* Dropdown */}
			{isOpen && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-30"
						onClick={() => setIsOpen(false)}
					/>

					{/* Dropdown Panel */}
					<div className="absolute right-0 top-full mt-2 z-40 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
						{/* Header */}
						<div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
							<h3 className="font-semibold text-gray-900 dark:text-white">
								Notificações {unreadCount > 0 && `(${unreadCount})`}
							</h3>
							{unreadCount > 0 && (
								<button
									onClick={handleMarkAllAsRead}
									className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
								>
									<CheckCheck className="w-3 h-3" />
									Marcar todas como lidas
								</button>
							)}
						</div>

						{/* Notifications List */}
						<div className="max-h-96 overflow-y-auto">
							{notifications.length === 0 ? (
								<div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
									<Bell className="w-12 h-12 mx-auto mb-2 opacity-20" />
									<p className="text-sm">Nenhuma notificação nova</p>
								</div>
							) : (
								<div className="divide-y divide-gray-100 dark:divide-gray-700">
									{notifications.map((notification) => (
										<div
											key={notification.id}
											className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors group"
										>
											<div className="flex items-start gap-3">
												{/* Icon */}
												<div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${getNotificationColor(notification.type)}`} />

												{/* Content */}
												<div className="flex-1 min-w-0">
													<h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
														{notification.title}
													</h4>
													{notification.message && notification.message !== '[Mensagem sem texto]' && (
														<p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
															{notification.message}
														</p>
													)}
													<div className="flex items-center justify-between">
														<span className="text-xs text-gray-500 dark:text-gray-500">
															{formatDistanceToNow(new Date(notification.created_at), {
																addSuffix: true,
																locale: ptBR,
															})}
														</span>
														{notification.link && (
															<a
																href={notification.link}
																className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
																onClick={() => {
																	handleMarkAsRead(notification.id)
																	setIsOpen(false)
																}}
															>
																Ver detalhes →
															</a>
														)}
													</div>
												</div>

												{/* Mark as Read Button */}
												<button
													onClick={() => handleMarkAsRead(notification.id)}
													className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-gray-200 dark:hover:bg-gray-600"
													aria-label="Marcar como lida"
												>
													<X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	)
}

function getNotificationColor(type: string): string {
	const colors: Record<string, string> = {
		new_conversation: 'bg-blue-500',
		conversation_waiting: 'bg-yellow-500',
		no_response_24h: 'bg-red-500',
		appointment_confirmed: 'bg-green-500',
		appointment_canceled: 'bg-gray-500',
		low_response_rate: 'bg-orange-500',
	}

	return colors[type] || 'bg-gray-500'
}
