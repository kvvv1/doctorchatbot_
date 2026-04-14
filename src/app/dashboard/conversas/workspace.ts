import type { ConversationStatus } from '@/lib/types/database'

export type ConversationStatusFilter =
	| 'all'
	| 'new'
	| 'in_progress'
	| 'waiting_patient'
	| 'scheduled'
	| 'done'

export interface ConversationWorkspace {
	activeConversationId: string | null
	openConversationIds: string[]
	searchQuery: string
	statusFilter: ConversationStatusFilter
	showOnlyHumanNeeded: boolean
	draftsByConversationId: Record<string, string>
}

interface SearchParamsLike {
	get(name: string): string | null
	has(name: string): boolean
	toString(): string
}

export const CONVERSATION_WORKSPACE_STORAGE_KEY = 'dashboard.conversations.workspace.v1'

export const DEFAULT_CONVERSATION_WORKSPACE: ConversationWorkspace = {
	activeConversationId: null,
	openConversationIds: [],
	searchQuery: '',
	statusFilter: 'all',
	showOnlyHumanNeeded: false,
	draftsByConversationId: {},
}

const VALID_STATUS_FILTERS = new Set<ConversationStatusFilter>([
	'all',
	'new',
	'in_progress',
	'waiting_patient',
	'scheduled',
	'done',
])

function normalizeConversationId(value: unknown): string | null {
	if (typeof value !== 'string') return null

	const trimmed = value.trim()
	return trimmed ? trimmed : null
}

function dedupeConversationIds(ids: unknown): string[] {
	if (!Array.isArray(ids)) return []

	const seen = new Set<string>()

	return ids.reduce<string[]>((acc, value) => {
		const conversationId = normalizeConversationId(value)
		if (!conversationId || seen.has(conversationId)) return acc

		seen.add(conversationId)
		acc.push(conversationId)
		return acc
	}, [])
}

function normalizeDrafts(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

	return Object.entries(value).reduce<Record<string, string>>((acc, [conversationId, draft]) => {
		const normalizedId = normalizeConversationId(conversationId)
		if (!normalizedId || typeof draft !== 'string' || draft.length === 0) return acc

		acc[normalizedId] = draft
		return acc
	}, {})
}

export function parseConversationStatusFilter(
	value: string | ConversationStatus | null | undefined,
): ConversationStatusFilter {
	if (!value || !VALID_STATUS_FILTERS.has(value as ConversationStatusFilter)) {
		return 'all'
	}

	return value as ConversationStatusFilter
}

export function readConversationWorkspaceFromStorage(rawValue: string | null): ConversationWorkspace {
	if (!rawValue) return DEFAULT_CONVERSATION_WORKSPACE

	try {
		const parsed = JSON.parse(rawValue) as Partial<ConversationWorkspace> | null
		if (!parsed || typeof parsed !== 'object') return DEFAULT_CONVERSATION_WORKSPACE

		const activeConversationId = normalizeConversationId(parsed.activeConversationId)
		const openConversationIds = dedupeConversationIds(parsed.openConversationIds)
		const searchQuery = typeof parsed.searchQuery === 'string' ? parsed.searchQuery : ''
		const statusFilter = parseConversationStatusFilter(parsed.statusFilter)
		const showOnlyHumanNeeded = Boolean(parsed.showOnlyHumanNeeded)
		const draftsByConversationId = normalizeDrafts(parsed.draftsByConversationId)

		return {
			activeConversationId,
			openConversationIds: activeConversationId
				? dedupeConversationIds([...openConversationIds, activeConversationId])
				: openConversationIds,
			searchQuery,
			statusFilter,
			showOnlyHumanNeeded,
			draftsByConversationId,
		}
	} catch {
		return DEFAULT_CONVERSATION_WORKSPACE
	}
}

export function buildInitialConversationWorkspace(
	searchParams: SearchParamsLike,
	storedWorkspace: ConversationWorkspace,
): ConversationWorkspace {
	const activeConversationId = searchParams.has('id')
		? normalizeConversationId(searchParams.get('id'))
		: storedWorkspace.activeConversationId
	const searchQuery = searchParams.has('q')
		? searchParams.get('q') ?? ''
		: storedWorkspace.searchQuery
	const statusFilter = searchParams.has('status')
		? parseConversationStatusFilter(searchParams.get('status'))
		: storedWorkspace.statusFilter
	const showOnlyHumanNeeded = searchParams.has('human')
		? searchParams.get('human') === '1'
		: storedWorkspace.showOnlyHumanNeeded

	return {
		activeConversationId,
		openConversationIds: activeConversationId
			? dedupeConversationIds([...storedWorkspace.openConversationIds, activeConversationId])
			: dedupeConversationIds(storedWorkspace.openConversationIds),
		searchQuery,
		statusFilter,
		showOnlyHumanNeeded,
		draftsByConversationId: normalizeDrafts(storedWorkspace.draftsByConversationId),
	}
}

export function buildConversationSearchParams(
	currentSearchParams: SearchParamsLike,
	workspace: Pick<
		ConversationWorkspace,
		'activeConversationId' | 'searchQuery' | 'statusFilter' | 'showOnlyHumanNeeded'
	>,
): URLSearchParams {
	const nextSearchParams = new URLSearchParams(currentSearchParams.toString())

	nextSearchParams.delete('id')
	nextSearchParams.delete('q')
	nextSearchParams.delete('status')
	nextSearchParams.delete('human')

	if (workspace.activeConversationId) {
		nextSearchParams.set('id', workspace.activeConversationId)
	}

	if (workspace.searchQuery.trim()) {
		nextSearchParams.set('q', workspace.searchQuery)
	}

	if (workspace.statusFilter !== 'all') {
		nextSearchParams.set('status', workspace.statusFilter)
	}

	if (workspace.showOnlyHumanNeeded) {
		nextSearchParams.set('human', '1')
	}

	return nextSearchParams
}

export function sanitizeConversationWorkspace(
	workspace: ConversationWorkspace,
	validConversationIds: string[],
): ConversationWorkspace {
	const validConversationSet = new Set(validConversationIds)
	const activeTabIndex = workspace.activeConversationId
		? workspace.openConversationIds.indexOf(workspace.activeConversationId)
		: -1
	const openConversationIds = workspace.openConversationIds.filter((conversationId) =>
		validConversationSet.has(conversationId),
	)
	const draftsByConversationId = Object.fromEntries(
		Object.entries(workspace.draftsByConversationId).filter(([conversationId, draft]) => {
			return validConversationSet.has(conversationId) && draft.length > 0
		}),
	)

	let activeConversationId =
		workspace.activeConversationId && validConversationSet.has(workspace.activeConversationId)
			? workspace.activeConversationId
			: null

	if (!activeConversationId && openConversationIds.length > 0) {
		activeConversationId =
			openConversationIds[activeTabIndex - 1] ??
			openConversationIds[activeTabIndex] ??
			openConversationIds[0] ??
			null
	}

	return {
		...workspace,
		activeConversationId,
		openConversationIds:
			activeConversationId && !openConversationIds.includes(activeConversationId)
				? [...openConversationIds, activeConversationId]
				: openConversationIds,
		draftsByConversationId,
	}
}
