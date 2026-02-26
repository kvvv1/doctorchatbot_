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

// Seed fake data for testing UI
const FAKE_CONVERSATIONS: Conversation[] = [
	{
		id: 'fake-1',
		clinic_id: 'fake-clinic',
		patient_phone: '+55 11 99999-8888',
		patient_name: 'Maria Silva',
		status: 'new',
		bot_enabled: true,	bot_state: 'menu',
	bot_context: {},		notes: null,
		last_message_at: new Date(Date.now() - 5 * 60000).toISOString(),
		last_message_preview: 'Olá, gostaria de agendar uma consulta para amanhã',
		last_patient_message_at: new Date(Date.now() - 5 * 60000).toISOString(),
		created_at: new Date(Date.now() - 30 * 60000).toISOString(),
		updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
	},
	{
		id: 'fake-2',
		clinic_id: 'fake-clinic',
		patient_phone: '+55 11 98888-7777',
		patient_name: 'João Santos',
		status: 'in_progress',
		bot_enabled: false,	bot_state: 'menu',
	bot_context: {},		notes: 'Paciente com histórico de alergias. Verificar antes de prescrever medicamentos.',
		last_message_at: new Date(Date.now() - 15 * 60000).toISOString(),
		last_message_preview: 'Perfeito! Confirmo o horário das 14h',
		last_patient_message_at: new Date(Date.now() - 35 * 60000).toISOString(), // 35 min - over threshold
		created_at: new Date(Date.now() - 120 * 60000).toISOString(),
		updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
	},
	{
		id: 'fake-3',
		clinic_id: 'fake-clinic',
		patient_phone: '+55 11 97777-6666',
		patient_name: 'Ana Costa',
		status: 'scheduled',
		bot_enabled: true,	bot_state: 'menu',
	bot_context: {},		notes: null,
		last_message_at: new Date(Date.now() - 60 * 60000).toISOString(),
		last_message_preview: 'Obrigada! Até segunda-feira então',
		last_patient_message_at: new Date(Date.now() - 60 * 60000).toISOString(), // 60 min - way over threshold
		created_at: new Date(Date.now() - 180 * 60000).toISOString(),
		updated_at: new Date(Date.now() - 60 * 60000).toISOString(),
	},
	{
		id: 'fake-4',
		clinic_id: 'fake-clinic',
		patient_phone: '+55 11 96666-5555',
		patient_name: 'Carlos Oliveira',
		status: 'waiting_patient',
		bot_enabled: false,	bot_state: 'menu',
	bot_context: {},		notes: 'Aguardando confirmação do paciente',
		last_message_at: new Date(Date.now() - 45 * 60000).toISOString(),
		last_message_preview: 'Ok, vou verificar minha agenda',
		last_patient_message_at: new Date(Date.now() - 45 * 60000).toISOString(),
		created_at: new Date(Date.now() - 200 * 60000).toISOString(),
		updated_at: new Date(Date.now() - 45 * 60000).toISOString(),
	},
	{
		id: 'fake-5',
		clinic_id: 'fake-clinic',
		patient_phone: '+55 11 95555-4444',
		patient_name: 'Beatriz Lima',
		status: 'new',
		bot_enabled: false,	bot_state: 'menu',
	bot_context: {},		notes: null,
		last_message_at: new Date(Date.now() - 2 * 60000).toISOString(),
		last_message_preview: 'Preciso de atendimento urgente',
		last_patient_message_at: new Date(Date.now() - 2 * 60000).toISOString(),
		created_at: new Date(Date.now() - 10 * 60000).toISOString(),
		updated_at: new Date(Date.now() - 2 * 60000).toISOString(),
	},
]

const FAKE_MESSAGES: Record<string, Message[]> = {
	'fake-1': [
		{
			id: 'msg-1',
			conversation_id: 'fake-1',
			sender: 'patient',
			content: 'Olá, gostaria de agendar uma consulta',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 30 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 30 * 60000).toISOString(),
		},
		{
			id: 'msg-2',
			conversation_id: 'fake-1',
			sender: 'bot',
			content: 'Olá! Claro, posso te ajudar. Qual especialidade você procura?',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 28 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 28 * 60000).toISOString(),
		},
		{
			id: 'msg-3',
			conversation_id: 'fake-1',
			sender: 'patient',
			content: 'Preciso de uma consulta com clínico geral',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 25 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 25 * 60000).toISOString(),
		},
		{
			id: 'msg-4',
			conversation_id: 'fake-1',
			sender: 'bot',
			content: 'Perfeito! Temos disponibilidade para amanhã às 10h ou 15h. Qual prefere?',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 23 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 23 * 60000).toISOString(),
		},
		{
			id: 'msg-5',
			conversation_id: 'fake-1',
			sender: 'patient',
			content: 'Olá, gostaria de agendar uma consulta para amanhã',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 5 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
		},
	],
	'fake-2': [
		{
			id: 'msg-6',
			conversation_id: 'fake-2',
			sender: 'patient',
			content: 'Bom dia! Preciso remarcar minha consulta',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 120 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 120 * 60000).toISOString(),
		},
		{
			id: 'msg-7',
			conversation_id: 'fake-2',
			sender: 'human',
			content: 'Bom dia, João! Claro, quando você prefere?',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 115 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 115 * 60000).toISOString(),
		},
		{
			id: 'msg-8',
			conversation_id: 'fake-2',
			sender: 'patient',
			content: 'Pode ser quinta-feira às 14h?',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 110 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 110 * 60000).toISOString(),
		},
		{
			id: 'msg-9',
			conversation_id: 'fake-2',
			sender: 'human',
			content: 'Quinta-feira às 14h está disponível! Vou confirmar para você.',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 17 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 17 * 60000).toISOString(),
		},
		{
			id: 'msg-10',
			conversation_id: 'fake-2',
			sender: 'patient',
			content: 'Perfeito! Confirmo o horário das 14h',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 15 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
		},
	],
	'fake-3': [
		{
			id: 'msg-11',
			conversation_id: 'fake-3',
			sender: 'patient',
			content: 'Oi! Quero agendar um checkup',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 180 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 180 * 60000).toISOString(),
		},
		{
			id: 'msg-12',
			conversation_id: 'fake-3',
			sender: 'human',
			content: 'Olá Ana! Temos horários disponíveis segunda às 9h ou quarta às 16h',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 65 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 65 * 60000).toISOString(),
		},
		{
			id: 'msg-13',
			conversation_id: 'fake-3',
			sender: 'patient',
			content: 'Obrigada! Até segunda-feira então',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 60 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 60 * 60000).toISOString(),
		},
	],
	'fake-4': [
		{
			id: 'msg-14',
			conversation_id: 'fake-4',
			sender: 'patient',
			content: 'Preciso remarcar meu exame',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 200 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 200 * 60000).toISOString(),
		},
		{
			id: 'msg-15',
			conversation_id: 'fake-4',
			sender: 'human',
			content: 'Olá Carlos! Temos disponibilidade na sexta-feira às 10h ou na segunda às 15h. Qual prefere?',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 47 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 47 * 60000).toISOString(),
		},
		{
			id: 'msg-16',
			conversation_id: 'fake-4',
			sender: 'patient',
			content: 'Ok, vou verificar minha agenda',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 45 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 45 * 60000).toISOString(),
		},
	],
	'fake-5': [
		{
			id: 'msg-17',
			conversation_id: 'fake-5',
			sender: 'patient',
			content: 'Preciso de atendimento urgente',
			zapi_message_id: null,
			created_at: new Date(Date.now() - 2 * 60000).toISOString(),
			updated_at: new Date(Date.now() - 2 * 60000).toISOString(),
		},
	],
}

export default function ConversasPageClient({ clinicId }: ConversasPageClientProps) {
	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const [statusFilter, setStatusFilter] = useState<ConversationStatus | 'all'>('all')
	const [showOnlyHumanNeeded, setShowOnlyHumanNeeded] = useState(false)
	const [useFakeData, setUseFakeData] = useState(false)
	const [fakeConversations, setFakeConversations] = useState(FAKE_CONVERSATIONS)
	const [fakeMessages, setFakeMessages] = useState(FAKE_MESSAGES)

	const { conversations: realConversations, loading: conversationsLoading } = useConversations({
		clinicId,
		searchQuery,
	})

	const { messages: realMessages, loading: messagesLoading } = useMessages({
		conversationId: selectedConversationId && !useFakeData ? selectedConversationId : null,
	})

	// Use fake or real data
	const conversations = useFakeData ? fakeConversations : realConversations
	const messages = useFakeData && selectedConversationId 
		? fakeMessages[selectedConversationId] || []
		: realMessages
	const loading = useFakeData ? false : conversationsLoading || messagesLoading

	// Filter conversations by status and human attention
	const filteredConversations = useMemo(() => {
		let filtered = conversations

		// Apply status filter
		if (statusFilter !== 'all') {
			filtered = filtered.filter(c => c.status === statusFilter)
		}

		// Apply human attention filter
		if (showOnlyHumanNeeded) {
			filtered = filtered.filter(c => !c.bot_enabled && c.status !== 'done')
		}

		// Sort by human attention (priority) and then by recency
		return filtered.sort((a, b) => {
			const aNeedsHuman = !a.bot_enabled && a.status !== 'done'
			const bNeedsHuman = !b.bot_enabled && b.status !== 'done'

			// Conversations needing human attention go first
			if (aNeedsHuman && !bNeedsHuman) return -1
			if (!aNeedsHuman && bNeedsHuman) return 1

			// Within the same priority, sort by most recent
			const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
			const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
			return bTime - aTime
		})
	}, [conversations, statusFilter, showOnlyHumanNeeded])

	// Count conversations needing human attention
	const humanNeededCount = useMemo(() => {
		return conversations.filter(c => !c.bot_enabled && c.status !== 'done').length
	}, [conversations])

	const selectedConversation = conversations.find((c) => c.id === selectedConversationId) || null

	const handleCreateFakeConversation = () => {
		const newId = `fake-${Date.now()}`
		const newConversation: Conversation = {
			id: newId,
			clinic_id: clinicId,
			patient_phone: `+55 11 9${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
			patient_name: `Paciente ${fakeConversations.length + 1}`,
			status: 'new',
			bot_enabled: true,
			bot_state: 'menu',
			bot_context: {},
			notes: null,
			last_message_at: new Date().toISOString(),
			last_message_preview: 'Nova conversa criada',
			last_patient_message_at: null,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}
		setFakeConversations([newConversation, ...fakeConversations])
		setFakeMessages({
			...fakeMessages,
			[newId]: [],
		})
		setUseFakeData(true)
		setSelectedConversationId(newId)
	}

	const handleSendMessage = async (content: string) => {
		if (!selectedConversationId) return

		// If using fake data
		if (useFakeData) {
			const newMessage: Message = {
				id: `msg-${Date.now()}`,
				conversation_id: selectedConversationId,
				sender: 'human',
				content,
				zapi_message_id: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}
			
			setFakeMessages({
				...fakeMessages,
				[selectedConversationId]: [
					...(fakeMessages[selectedConversationId] || []),
					newMessage,
				],
			})

			setFakeConversations(
				fakeConversations.map(c =>
					c.id === selectedConversationId
						? {
								...c,
								last_message_at: new Date().toISOString(),
								last_message_preview: content.slice(0, 100),
								updated_at: new Date().toISOString(),
						  }
						: c
				)
			)
			return
		}

		// Real data - send via Z-API endpoint
		const conversation = conversations.find(c => c.id === selectedConversationId)
		if (!conversation) {
			throw new Error('Conversa não encontrada')
		}

		try {
			const response = await fetch('/api/zapi/send-text', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					conversationId: selectedConversationId,
					phone: conversation.patient_phone,
					text: content,
				}),
			})

			const result = await response.json()

			if (!response.ok || !result.ok) {
				throw new Error(result.error || 'Falha ao enviar mensagem')
			}

			// Mensagem enviada e salva com sucesso
			// O realtime do Supabase vai atualizar automaticamente messages e conversations
		} catch (error) {
			console.error('Error sending message:', error)
			throw error
		}
	}

	const handleUpdateStatus = (status: ConversationStatus) => {
		if (!selectedConversationId) return

		if (useFakeData) {
			setFakeConversations(
				fakeConversations.map(c =>
					c.id === selectedConversationId ? { ...c, status } : c
				)
			)
			return
		}

		// Real data
		const supabase = createClient()
		supabase
			.from('conversations')
			.update({ status, updated_at: new Date().toISOString() })
			.eq('id', selectedConversationId)
			.then(({ error }) => {
				if (error) console.error('Error updating status:', error)
			})
	}

	const handleToggleBotEnabled = (enabled: boolean) => {
		if (!selectedConversationId) return

		if (useFakeData) {
			setFakeConversations(
				fakeConversations.map(c =>
					c.id === selectedConversationId ? { ...c, bot_enabled: enabled } : c
				)
			)
			return
		}

		// Real data
		const supabase = createClient()
		supabase
			.from('conversations')
			.update({ bot_enabled: enabled, updated_at: new Date().toISOString() })
			.eq('id', selectedConversationId)
			.then(({ error }) => {
				if (error) console.error('Error updating bot_enabled:', error)
			})
	}

	const handleSaveNotes = async (notes: string) => {
		if (!selectedConversationId) return

		if (useFakeData) {
			setFakeConversations(
				fakeConversations.map(c =>
					c.id === selectedConversationId ? { ...c, notes, updated_at: new Date().toISOString() } : c
				)
			)
			return
		}

		// Real data
		const supabase = createClient()
		const { error } = await supabase
			.from('conversations')
			.update({ notes, updated_at: new Date().toISOString() })
			.eq('id', selectedConversationId)

		if (error) {
			console.error('Error saving notes:', error)
			throw error
		}
	}

	return (
		<div className="flex h-full">
			{/* Sidebar - Conversation List */}
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
					onCreateNew={handleCreateFakeConversation}
					showOnlyHumanNeeded={showOnlyHumanNeeded}
					onToggleHumanNeeded={() => setShowOnlyHumanNeeded(!showOnlyHumanNeeded)}
					humanNeededCount={humanNeededCount}
				/>
			</aside>

			{/* Main - Chat Panel */}
			<main className="flex-1 h-full hidden md:flex">
				<ChatPanel
					conversation={selectedConversation}
					messages={messages}
					loading={loading}
					onSendMessage={handleSendMessage}
					onUpdateStatus={handleUpdateStatus}
					onToggleBotEnabled={handleToggleBotEnabled}
					onSaveNotes={handleSaveNotes}
				/>
			</main>

			{/* Mobile View */}
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
						onCreateNew={handleCreateFakeConversation}
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
						onUpdateStatus={handleUpdateStatus}
						onToggleBotEnabled={handleToggleBotEnabled}
						onSaveNotes={handleSaveNotes}
						onBack={() => setSelectedConversationId(null)}
					/>
				)}
			</div>
		</div>
	)
}
