'use client'

import { useState, useMemo } from 'react'
import { useConversations } from '@/lib/hooks/useConversations'
import { useMessages } from '@/lib/hooks/useMessages'
import { createClient } from '@/lib/supabase/client'
import ConversationList from './components/ConversationList'
import ChatPanel from './components/ChatPanel'
import type { Conversation, Message, ConversationStatus } from '@/lib/types/database'

interface ConversasPageClientProps {
	clinicId: string
}

export default function ConversasPageClient({ clinicId }: ConversasPageClientProps) {
	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const [statusFilter, setStatusFilter] = useState<ConversationStatus | 'all'>('all')
	const [showOnlyHumanNeeded, setShowOnlyHumanNeeded] = useState(false)

	const { conversations, loading: conversationsLoading, refetch: refetchConversations } = useConversations({
		clinicId,
		searchQuery,
	})

	const { messages, loading: messagesLoading } = useMessages({
		conversationId: selectedConversationId,
	})

	const loading = conversationsLoading || messagesLoading

	// Filter and sort conversations
	const filteredConversations = useMemo(() => {
		let filtered = conversations

		if (statusFilter !== 'all') {
			filtered = filtered.filter(c => c.status === statusFilter)
		}

		if (showOnlyHumanNeeded) {
			filtered = filtered.filter(c => !c.bot_enabled && c.status !== 'done')
		}

		return filtered.sort((a, b) => {
			const aNeedsHuman = !a.bot_enabled && a.status !== 'done'
			const bNeedsHuman = !b.bot_enabled && b.status !== 'done'
			if (aNeedsHuman && !bNeedsHuman) return -1
			if (!aNeedsHuman && bNeedsHuman) return 1
			const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
			const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
			return bTime - aTime
		})
	}, [conversations, statusFilter, showOnlyHumanNeeded])

	const humanNeededCount = useMemo(
		() => conversations.filter(c => !c.bot_enabled && c.status !== 'done').length,
		[conversations]
	)

	const selectedConversation = conversations.find(c => c.id === selectedConversationId) ?? null

	// ---------------------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------------------

	const handleSendMessage = async (content: string) => {
		if (!selectedConversationId || !selectedConversation) return

		const response = await fetch('/api/zapi/send-text', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				conversationId: selectedConversationId,
				phone: selectedConversation.patient_phone,
				text: content,
			}),
		})

		const result = await response.json()
		if (!response.ok || !result.ok) {
			throw new Error(result.error || 'Falha ao enviar mensagem')
		}
		// Supabase realtime updates the UI automatically
	}

	/** Atendente assume a conversa — desliga o bot e envia mensagem de boas-vindas */
	const handleTakeOver = async (welcomeMessage?: string) => {
		if (!selectedConversationId || !selectedConversation) return

		const supabase = createClient()

		// 1. Disable bot + update status
		await supabase
			.from('conversations')
			.update({
				bot_enabled: false,
				status: 'in_progress',
				updated_at: new Date().toISOString(),
			})
			.eq('id', selectedConversationId)

		// 2. Send welcome message if provided
		const msg = welcomeMessage?.trim()
		if (msg) {
			await fetch('/api/zapi/send-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					conversationId: selectedConversationId,
					phone: selectedConversation.patient_phone,
					text: msg,
				}),
			})
		}

		refetchConversations?.()
	}

	/** Devolve a conversa ao bot — religa e reseta o estado para o menu */
	const handleReturnToBot = async () => {
		if (!selectedConversationId) return

		const supabase = createClient()
		await supabase
			.from('conversations')
			.update({
				bot_enabled: true,
				bot_state: 'menu',
				bot_context: {},
				updated_at: new Date().toISOString(),
			})
			.eq('id', selectedConversationId)

		refetchConversations?.()
	}

	const handleUpdateStatus = (status: ConversationStatus) => {
		if (!selectedConversationId) return
		const supabase = createClient()
		supabase
			.from('conversations')
			.update({ status, updated_at: new Date().toISOString() })
			.eq('id', selectedConversationId)
			.then((res: { error: unknown }) => { if (res.error) console.error('Error updating status:', res.error) })
	}

	const handleSaveNotes = async (notes: string) => {
		if (!selectedConversationId) return
		const supabase = createClient()
		const { error } = await supabase
			.from('conversations')
			.update({ notes, updated_at: new Date().toISOString() })
			.eq('id', selectedConversationId)
		if (error) throw error
	}

	return (
		<div className="flex h-full">
			{/* Sidebar */}
			<aside className="w-full md:w-[360px] border-r border-neutral-200 h-full hidden md:flex">
				<ConversationList
					conversations={filteredConversations}
					selectedId={selectedConversationId}
					onSelect={setSelectedConversationId}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					statusFilter={statusFilter}
					onStatusFilterChange={setStatusFilter}
					loading={loading}
					showOnlyHumanNeeded={showOnlyHumanNeeded}
					onToggleHumanNeeded={() => setShowOnlyHumanNeeded(!showOnlyHumanNeeded)}
					humanNeededCount={humanNeededCount}
				/>
			</aside>

			{/* Chat Panel */}
			<main className="flex-1 h-full hidden md:flex">
				<ChatPanel
					conversation={selectedConversation}
					messages={messages}
					loading={loading}
					onSendMessage={handleSendMessage}
					onTakeOver={handleTakeOver}
					onReturnToBot={handleReturnToBot}
					onUpdateStatus={handleUpdateStatus}
					onSaveNotes={handleSaveNotes}
				/>
			</main>

			{/* Mobile */}
			<div className="flex h-full w-full md:hidden">
				{!selectedConversationId ? (
					<ConversationList
						conversations={filteredConversations}
						selectedId={selectedConversationId}
						onSelect={setSelectedConversationId}
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						statusFilter={statusFilter}
						onStatusFilterChange={setStatusFilter}
						loading={loading}
						showOnlyHumanNeeded={showOnlyHumanNeeded}
						onToggleHumanNeeded={() => setShowOnlyHumanNeeded(!showOnlyHumanNeeded)}
						humanNeededCount={humanNeededCount}
					/>
				) : (
					<ChatPanel
						conversation={selectedConversation}
						messages={messages}
						loading={loading}
						onSendMessage={handleSendMessage}
						onTakeOver={handleTakeOver}
						onReturnToBot={handleReturnToBot}
						onUpdateStatus={handleUpdateStatus}
						onSaveNotes={handleSaveNotes}
						onBack={() => setSelectedConversationId(null)}
					/>
				)}
			</div>
		</div>
	)
}
