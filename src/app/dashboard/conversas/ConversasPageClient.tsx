'use client'

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useConversations } from '@/lib/hooks/useConversations'
import { useMessages } from '@/lib/hooks/useMessages'
import { createClient } from '@/lib/supabase/client'
import ConversationList from './components/ConversationList'
import ChatPanel from './components/ChatPanel'
import ConversationTabs from './components/ConversationTabs'
import MobileInboxPwaBar from './components/MobileInboxPwaBar'
import type { ConversationStatus } from '@/lib/types/database'
import {
	buildConversationSearchParams,
	buildInitialConversationWorkspace,
	CONVERSATION_WORKSPACE_STORAGE_KEY,
	type ConversationStatusFilter,
	type ConversationWorkspace,
	readConversationWorkspaceFromStorage,
	sanitizeConversationWorkspace,
} from './workspace'

interface ConversasPageClientProps {
	clinicId: string
	defaultTakeoverMessage: string
	takeoverMessageEnabled: boolean
}

function arraysMatch(left: string[], right: string[]) {
	return left.length === right.length && left.every((value, index) => value === right[index])
}

function draftsMatch(left: Record<string, string>, right: Record<string, string>) {
	const leftKeys = Object.keys(left)
	const rightKeys = Object.keys(right)

	if (leftKeys.length !== rightKeys.length) return false

	return leftKeys.every((key) => left[key] === right[key])
}

function workspaceMatches(left: ConversationWorkspace, right: ConversationWorkspace) {
	return (
		left.activeConversationId === right.activeConversationId &&
		left.searchQuery === right.searchQuery &&
		left.statusFilter === right.statusFilter &&
		left.showOnlyHumanNeeded === right.showOnlyHumanNeeded &&
		arraysMatch(left.openConversationIds, right.openConversationIds) &&
		draftsMatch(left.draftsByConversationId, right.draftsByConversationId)
	)
}

export default function ConversasPageClient({ clinicId, defaultTakeoverMessage, takeoverMessageEnabled }: ConversasPageClientProps) {
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
	const [openConversationIds, setOpenConversationIds] = useState<string[]>([])
	const [searchQuery, setSearchQuery] = useState('')
	const deferredSearchQuery = useDeferredValue(searchQuery)
	const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>('all')
	const [showOnlyHumanNeeded, setShowOnlyHumanNeeded] = useState(false)
	const [draftsByConversationId, setDraftsByConversationId] = useState<Record<string, string>>({})
	const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState(false)
	const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)
	const didHydrateWorkspaceRef = useRef(false)
	const lastSearchParamsSnapshotRef = useRef<string | null>(null)

	const workspace = useMemo<ConversationWorkspace>(
		() => ({
			activeConversationId,
			openConversationIds,
			searchQuery,
			statusFilter,
			showOnlyHumanNeeded,
			draftsByConversationId,
		}),
		[
			activeConversationId,
			openConversationIds,
			searchQuery,
			statusFilter,
			showOnlyHumanNeeded,
			draftsByConversationId,
		],
	)

	const {
		allConversations,
		loading: conversationsLoading,
		error: conversationsError,
		refetch: refetchConversations,
		updateConversation,
		markConversationRead,
	} = useConversations({
		clinicId,
	})

	const activeConversation =
		allConversations.find((conversation) => conversation.id === activeConversationId) ?? null

	const {
		messages,
		loading: messagesLoading,
		refetch: refetchMessages,
		sendMessage,
		retryMessage,
	} = useMessages({
		conversationId: activeConversationId,
		phone: activeConversation?.patient_phone,
		onConversationActivity: (activity) => {
			if (!activeConversationId) return

			updateConversation(activeConversationId, {
				...activity,
				unread_count: activity.unread_count ?? 0,
				updated_at: new Date().toISOString(),
			})
		},
	})

	const loading = conversationsLoading || messagesLoading
	const activeConversationLastMessageAtRef = useRef<string | null>(null)

	useEffect(() => {
		if (!activeConversationId) {
			activeConversationLastMessageAtRef.current = null
			return
		}

		const latestActivityAt = activeConversation?.last_message_at ?? null
		if (!latestActivityAt) return

		if (activeConversationLastMessageAtRef.current === latestActivityAt) return

		activeConversationLastMessageAtRef.current = latestActivityAt
		void refetchMessages()
	}, [activeConversation?.last_message_at, activeConversationId, refetchMessages])

	useEffect(() => {
		if (didHydrateWorkspaceRef.current) return

		const storedWorkspace = readConversationWorkspaceFromStorage(
			window.localStorage.getItem(CONVERSATION_WORKSPACE_STORAGE_KEY),
		)
		const initialWorkspace = buildInitialConversationWorkspace(searchParams, storedWorkspace)

		startTransition(() => {
			setActiveConversationId(initialWorkspace.activeConversationId)
			setOpenConversationIds(initialWorkspace.openConversationIds)
			setSearchQuery(initialWorkspace.searchQuery)
			setStatusFilter(initialWorkspace.statusFilter)
			setShowOnlyHumanNeeded(initialWorkspace.showOnlyHumanNeeded)
			setDraftsByConversationId(initialWorkspace.draftsByConversationId)
			setIsMobileChatOpen(Boolean(initialWorkspace.activeConversationId))
			setIsWorkspaceHydrated(true)
		})
		lastSearchParamsSnapshotRef.current = searchParams.toString()
		didHydrateWorkspaceRef.current = true
	}, [searchParams])

	useEffect(() => {
		if (!isWorkspaceHydrated) return

		const currentSearchParamsSnapshot = searchParams.toString()
		if (lastSearchParamsSnapshotRef.current === null) {
			lastSearchParamsSnapshotRef.current = currentSearchParamsSnapshot
			return
		}

		if (currentSearchParamsSnapshot === lastSearchParamsSnapshotRef.current) return

		lastSearchParamsSnapshotRef.current = currentSearchParamsSnapshot

		const nextWorkspace = buildInitialConversationWorkspace(searchParams, workspace)
		if (workspaceMatches(workspace, nextWorkspace)) return

		startTransition(() => {
			setActiveConversationId(nextWorkspace.activeConversationId)
			setOpenConversationIds(nextWorkspace.openConversationIds)
			setSearchQuery(nextWorkspace.searchQuery)
			setStatusFilter(nextWorkspace.statusFilter)
			setShowOnlyHumanNeeded(nextWorkspace.showOnlyHumanNeeded)
			setDraftsByConversationId(nextWorkspace.draftsByConversationId)
			setIsMobileChatOpen(Boolean(nextWorkspace.activeConversationId))
		})
	}, [isWorkspaceHydrated, searchParams, workspace])

	useEffect(() => {
		if (!isWorkspaceHydrated) return

		const nextSearchParams = buildConversationSearchParams(searchParams, {
			activeConversationId,
			searchQuery,
			statusFilter,
			showOnlyHumanNeeded,
		})
		const nextSearchParamsSnapshot = nextSearchParams.toString()
		const currentSearchParamsSnapshot = searchParams.toString()

		if (nextSearchParamsSnapshot === currentSearchParamsSnapshot) return

		lastSearchParamsSnapshotRef.current = nextSearchParamsSnapshot
		router.replace(nextSearchParamsSnapshot ? `${pathname}?${nextSearchParamsSnapshot}` : pathname, {
			scroll: false,
		})
	}, [
		activeConversationId,
		isWorkspaceHydrated,
		pathname,
		router,
		searchParams,
		searchQuery,
		showOnlyHumanNeeded,
		statusFilter,
	])

	useEffect(() => {
		if (!isWorkspaceHydrated) return

		window.localStorage.setItem(CONVERSATION_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace))
	}, [isWorkspaceHydrated, workspace])

	useEffect(() => {
		if (!isWorkspaceHydrated || conversationsLoading) return

		const sanitizedWorkspace = sanitizeConversationWorkspace(
			workspace,
			allConversations.map((conversation) => conversation.id),
		)

		if (workspaceMatches(workspace, sanitizedWorkspace)) return

		startTransition(() => {
			setActiveConversationId(sanitizedWorkspace.activeConversationId)
			setOpenConversationIds(sanitizedWorkspace.openConversationIds)
			setDraftsByConversationId(sanitizedWorkspace.draftsByConversationId)

			if (!sanitizedWorkspace.activeConversationId) {
				setIsMobileChatOpen(false)
			}
		})
	}, [allConversations, conversationsLoading, isWorkspaceHydrated, workspace])

	const filteredConversations = useMemo(() => {
		let filtered = [...allConversations]

		const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()
		if (normalizedSearchQuery) {
			filtered = filtered.filter((conversation) => {
				const patientName = conversation.patient_name?.toLowerCase() ?? ''
				const patientPhone = conversation.patient_phone.toLowerCase()
				return (
					patientName.includes(normalizedSearchQuery) ||
					patientPhone.includes(normalizedSearchQuery)
				)
			})
		}

		if (statusFilter !== 'all') {
			filtered = filtered.filter((conversation) => conversation.status === statusFilter)
		}

		if (showOnlyHumanNeeded) {
			filtered = filtered.filter(
				(conversation) => !conversation.bot_enabled && conversation.status !== 'done',
			)
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
	}, [allConversations, deferredSearchQuery, showOnlyHumanNeeded, statusFilter])

	const humanNeededCount = useMemo(
		() =>
			allConversations.filter(
				(conversation) => !conversation.bot_enabled && conversation.status !== 'done',
			).length,
		[allConversations],
	)

	const openConversations = useMemo(
		() =>
			openConversationIds
				.map((conversationId) =>
					allConversations.find((conversation) => conversation.id === conversationId) ?? null,
				)
				.filter((conversation): conversation is NonNullable<typeof conversation> => Boolean(conversation)),
		[allConversations, openConversationIds],
	)
	const activeDraft = activeConversationId ? draftsByConversationId[activeConversationId] ?? '' : ''

	useEffect(() => {
		if (!activeConversationId || !activeConversation || activeConversation.unread_count === 0) return
		void markConversationRead(activeConversationId)
	}, [activeConversation, activeConversationId, markConversationRead])

	const handleActivateConversation = (conversationId: string) => {
		setActiveConversationId(conversationId)
		setOpenConversationIds((currentOpenConversationIds) =>
			currentOpenConversationIds.includes(conversationId)
				? currentOpenConversationIds
				: [...currentOpenConversationIds, conversationId],
		)
		setIsMobileChatOpen(true)
		void markConversationRead(conversationId)
	}

	const handleCloseConversationTab = (conversationId: string) => {
		const tabIndex = openConversationIds.indexOf(conversationId)
		if (tabIndex === -1) return

		const nextOpenConversationIds = openConversationIds.filter((openId) => openId !== conversationId)
		setOpenConversationIds(nextOpenConversationIds)

		if (activeConversationId !== conversationId) return

		const nextActiveConversationId =
			nextOpenConversationIds[tabIndex - 1] ?? nextOpenConversationIds[tabIndex] ?? null

		setActiveConversationId(nextActiveConversationId)
		if (!nextActiveConversationId) {
			setIsMobileChatOpen(false)
		}
	}

	const handleDraftChange = (content: string) => {
		if (!activeConversationId) return

		setDraftsByConversationId((currentDrafts) => {
			if (content.length === 0) {
				if (!(activeConversationId in currentDrafts)) return currentDrafts

				const nextDrafts = { ...currentDrafts }
				delete nextDrafts[activeConversationId]
				return nextDrafts
			}

			return {
				...currentDrafts,
				[activeConversationId]: content,
			}
		})
	}

	const handleSendMessage = async (content: string) => {
		if (!activeConversationId || !activeConversation) return

		await sendMessage(content)

		setDraftsByConversationId((currentDrafts) => {
			if (!(activeConversationId in currentDrafts)) return currentDrafts

			const nextDrafts = { ...currentDrafts }
			delete nextDrafts[activeConversationId]
			return nextDrafts
		})
	}

	const handleTakeOver = async (welcomeMessage?: string) => {
		if (!activeConversationId || !activeConversation) return

		const supabase = createClient()

		await supabase
			.from('conversations')
			.update({
				bot_enabled: false,
				status: 'in_progress',
				updated_at: new Date().toISOString(),
			})
			.eq('id', activeConversationId)

		updateConversation(activeConversationId, {
			bot_enabled: false,
			status: 'in_progress',
			updated_at: new Date().toISOString(),
		})

		const msg = welcomeMessage?.trim()
		if (msg) {
			await sendMessage(msg)
		}

		refetchConversations?.()
	}

	const handleReturnToBot = async () => {
		if (!activeConversationId) return

		const supabase = createClient()
		await supabase
			.from('conversations')
			.update({
				bot_enabled: true,
				bot_state: 'menu',
				bot_context: {},
				updated_at: new Date().toISOString(),
			})
			.eq('id', activeConversationId)

		updateConversation(activeConversationId, {
			bot_enabled: true,
			bot_state: 'menu',
			bot_context: {},
			updated_at: new Date().toISOString(),
		})

		refetchConversations?.()
	}

	const handleUpdateStatus = (status: ConversationStatus) => {
		if (!activeConversationId) return

		const supabase = createClient()
		updateConversation(activeConversationId, {
			status,
			updated_at: new Date().toISOString(),
		})

		supabase
			.from('conversations')
			.update({ status, updated_at: new Date().toISOString() })
			.eq('id', activeConversationId)
			.then((res: { error: unknown }) => {
				if (res.error) console.error('Error updating status:', res.error)
			})
	}

	const handleSaveNotes = async (notes: string) => {
		if (!activeConversationId) return

		const supabase = createClient()
		updateConversation(activeConversationId, {
			notes,
			updated_at: new Date().toISOString(),
		})
		const { error } = await supabase
			.from('conversations')
			.update({ notes, updated_at: new Date().toISOString() })
			.eq('id', activeConversationId)

		if (error) throw error
	}

	return (
		<div className="flex h-full min-h-0">
			<aside className="hidden h-full w-full border-r border-neutral-200 md:flex md:w-[360px]">
				<ConversationList
					conversations={filteredConversations}
					selectedId={activeConversationId}
					onSelect={handleActivateConversation}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					statusFilter={statusFilter}
					onStatusFilterChange={setStatusFilter}
					loading={loading}
					error={conversationsError}
					showOnlyHumanNeeded={showOnlyHumanNeeded}
					onToggleHumanNeeded={() => setShowOnlyHumanNeeded(!showOnlyHumanNeeded)}
					humanNeededCount={humanNeededCount}
				/>
			</aside>

			<main className="hidden h-full min-h-0 flex-1 md:flex">
				<div className="flex min-h-0 flex-1 flex-col">
					<ConversationTabs
						conversations={openConversations}
						activeId={activeConversationId}
						onSelect={handleActivateConversation}
						onClose={handleCloseConversationTab}
					/>
					<div className="min-h-0 flex-1">
						<ChatPanel
							conversation={activeConversation}
							messages={messages}
							loading={loading}
							onSendMessage={handleSendMessage}
							onTakeOver={handleTakeOver}
							onReturnToBot={handleReturnToBot}
							onUpdateStatus={handleUpdateStatus}
							onSaveNotes={handleSaveNotes}
							draftMessage={activeDraft}
							onDraftMessageChange={handleDraftChange}
							onRetryMessage={retryMessage}						defaultTakeoverMessage={defaultTakeoverMessage}
						takeoverMessageEnabled={takeoverMessageEnabled}						/>
					</div>
				</div>
			</main>

			<div className="flex h-full w-full md:hidden">
				{!isMobileChatOpen ? (
					<div className="flex h-full w-full flex-col bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_rgba(255,255,255,0)_42%),linear-gradient(180deg,_#f5f7fb_0%,_#eef2f7_100%)] px-3 pb-3 pt-3">
						<MobileInboxPwaBar />
						<div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
							<ConversationList
								conversations={filteredConversations}
								selectedId={activeConversationId}
								onSelect={handleActivateConversation}
								searchQuery={searchQuery}
								onSearchChange={setSearchQuery}
								statusFilter={statusFilter}
								onStatusFilterChange={setStatusFilter}
								loading={loading}
								showOnlyHumanNeeded={showOnlyHumanNeeded}
								onToggleHumanNeeded={() => setShowOnlyHumanNeeded(!showOnlyHumanNeeded)}
								humanNeededCount={humanNeededCount}
							/>
						</div>
					</div>
				) : (
					<ChatPanel
						conversation={activeConversation}
						messages={messages}
						loading={loading}
						onSendMessage={handleSendMessage}
						onTakeOver={handleTakeOver}
						onReturnToBot={handleReturnToBot}
						onUpdateStatus={handleUpdateStatus}
						onSaveNotes={handleSaveNotes}
						onBack={() => setIsMobileChatOpen(false)}
						draftMessage={activeDraft}
						onDraftMessageChange={handleDraftChange}
						onRetryMessage={retryMessage}
						defaultTakeoverMessage={defaultTakeoverMessage}
						takeoverMessageEnabled={takeoverMessageEnabled}
					/>
				)}
			</div>
		</div>
	)
}
