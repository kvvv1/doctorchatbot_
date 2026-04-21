import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireActiveSubscription } from '@/lib/auth/requireActiveSubscription'
import { checkSubscription } from '@/lib/services/subscriptionService'
import { createClient } from '@/lib/supabase/server'
import {
	MessageSquare,
	Clock,
	Calendar,
	CheckCircle,
	Timer,
	MessagesSquare,
	UserCheck,
	Bell,
	AlertCircle,
	Check,
	ArrowRight,
	ChevronRight,
} from 'lucide-react'
import type { Conversation } from '@/lib/types/database'
import { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Dashboard',
	description: 'Painel de controle do seu atendimento',
}

export const dynamic = 'force-dynamic'

async function getMetrics(clinicId: string) {
	const supabase = await createClient()
	const today = new Date()
	today.setHours(0, 0, 0, 0)

	// Buscar contagens de conversas
	const [newToday, waiting, scheduled, done] = await Promise.all([
		supabase
			.from('conversations')
			.select('id', { count: 'exact', head: true })
			.eq('clinic_id', clinicId)
			.eq('status', 'new')
			.gte('created_at', today.toISOString()),
		supabase
			.from('conversations')
			.select('id', { count: 'exact', head: true })
			.eq('clinic_id', clinicId)
			.eq('status', 'waiting_patient'),
		supabase
			.from('conversations')
			.select('id', { count: 'exact', head: true })
			.eq('clinic_id', clinicId)
			.eq('status', 'scheduled'),
		supabase
			.from('conversations')
			.select('id', { count: 'exact', head: true })
			.eq('clinic_id', clinicId)
			.eq('status', 'done'),
	])

	return {
		newToday: newToday.count || 0,
		waiting: waiting.count || 0,
		scheduled: scheduled.count || 0,
		done: done.count || 0,
	}
}

async function getAdditionalMetrics(clinicId: string) {
	const supabase = await createClient()

	// Conversas em aberto (status != done)
	const { count: openCount } = await supabase
		.from('conversations')
		.select('id', { count: 'exact', head: true })
		.eq('clinic_id', clinicId)
		.neq('status', 'done')

	// Confirmações de presença neste mês (substitui no-show mock)
	const startOfMonth = new Date()
	startOfMonth.setDate(1)
	startOfMonth.setHours(0, 0, 0, 0)
	const { count: confirmedThisMonth } = await supabase
		.from('appointments')
		.select('id', { count: 'exact', head: true })
		.eq('clinic_id', clinicId)
		.eq('status', 'confirmed')
		.gte('starts_at', startOfMonth.toISOString())

	// Tempo médio de resposta da equipe (mensagens humanas)
	// Busca pares: mensagem do paciente → próxima resposta não-paciente
	const { data: clinicConversations } = await supabase
		.from('conversations')
		.select('id')
		.eq('clinic_id', clinicId)
		.limit(50)

	const conversationIds = clinicConversations?.map((c: { id: string }) => c.id) || []

	let avgResponseTime = '—'
	if (conversationIds.length > 0) {
		const { data: recentMessages } = await supabase
			.from('messages')
			.select('conversation_id, sender, created_at')
			.in('conversation_id', conversationIds)
			.order('created_at', { ascending: true })
			.limit(200)

		if (recentMessages && recentMessages.length > 1) {
			const responseTimes: number[] = []
			// Group by conversation
			const byConv: Record<string, typeof recentMessages> = {}
			for (const m of recentMessages) {
				if (!byConv[m.conversation_id]) byConv[m.conversation_id] = []
				byConv[m.conversation_id].push(m)
			}
			for (const msgs of Object.values(byConv)) {
				for (let i = 0; i < msgs.length - 1; i++) {
					// Find patient message followed by staff/bot reply
					if (msgs[i].sender === 'patient' && msgs[i + 1].sender !== 'patient') {
						const diff = new Date(msgs[i + 1].created_at).getTime() - new Date(msgs[i].created_at).getTime()
						// Only count responses under 2 hours
						if (diff > 0 && diff < 7200000) responseTimes.push(diff)
					}
				}
			}
			if (responseTimes.length > 0) {
				const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
				const minutes = Math.floor(avg / 60000)
				const seconds = Math.floor((avg % 60000) / 1000)
				avgResponseTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
			}
		}
	}

	return {
		openConversations: openCount || 0,
		avgResponseTime,
		confirmedThisMonth: confirmedThisMonth || 0,
	}
}

async function getRecentConversations(clinicId: string) {
	const supabase = await createClient()

	const { data } = await supabase
		.from('conversations')
		.select('id, patient_name, patient_phone, status, last_message_at, created_at')
		.eq('clinic_id', clinicId)
		.order('last_message_at', { ascending: false, nullsFirst: false })
		.limit(5)

	return (data || []) as Conversation[]
}

async function getRecentNotifications(clinicId: string) {
	const supabase = await createClient()
	const { data } = await supabase
		.from('conversations')
		.select('id, patient_name, status, last_message_at, created_at')
		.eq('clinic_id', clinicId)
		.order('last_message_at', { ascending: false, nullsFirst: false })
		.limit(5)

	if (!data || data.length === 0) return []

	const statusTextMap: Record<string, string> = {
		new: 'Nova conversa iniciada',
		in_progress: 'Conversa em andamento',
		waiting_patient: 'Aguardando resposta do paciente',
		scheduled: 'Consulta agendada',
		reschedule: 'Solicitação de remarcação',
		canceled: 'Consulta cancelada',
		waitlist: 'Paciente na lista de espera',
		done: 'Conversa finalizada',
		waiting_human: 'Aguardando atendente',
	}
	const statusTypeMap: Record<string, 'message' | 'calendar' | 'alert' | 'check'> = {
		new: 'message',
		in_progress: 'message',
		waiting_patient: 'message',
		scheduled: 'calendar',
		reschedule: 'calendar',
		canceled: 'alert',
		waitlist: 'alert',
		done: 'check',
		waiting_human: 'alert',
	}

	return data.map((c: { id: string; patient_name: string | null; status: string; last_message_at: string | null; created_at: string }) => ({
		id: c.id,
		text: `${c.patient_name || 'Paciente'} — ${statusTextMap[c.status] ?? c.status}`,
		time: c.last_message_at || c.created_at,
		type: (statusTypeMap[c.status] ?? 'message') as 'message' | 'calendar' | 'alert' | 'check',
	}))
}

function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMins = Math.floor(diffMs / 60000)

	if (diffMins < 1) return 'Agora'
	if (diffMins < 60) return `${diffMins}min atrás`

	const diffHours = Math.floor(diffMins / 60)
	if (diffHours < 24) return `${diffHours}h atrás`

	const diffDays = Math.floor(diffHours / 24)
	return `${diffDays}d atrás`
}

function getNotificationIcon(type: 'message' | 'calendar' | 'alert' | 'check') {
	switch (type) {
		case 'message':
			return MessageSquare
		case 'calendar':
			return Calendar
		case 'alert':
			return AlertCircle
		case 'check':
			return Check
		default:
			return Bell
	}
}

const statusLabels: Record<string, string> = {
	new: 'Nova',
	in_progress: 'Em progresso',
	waiting_patient: 'Aguardando',
	scheduled: 'Agendada',
	reschedule: 'Reagendar',
	canceled: 'Cancelada',
	waitlist: 'Lista de espera',
	done: 'Finalizada',
}

const statusColors: Record<string, string> = {
	new: 'bg-blue-100 text-blue-700',
	in_progress: 'bg-purple-100 text-purple-700',
	waiting_patient: 'bg-orange-100 text-orange-700',
	scheduled: 'bg-green-100 text-green-700',
	reschedule: 'bg-yellow-100 text-yellow-700',
	canceled: 'bg-red-100 text-red-700',
	waitlist: 'bg-gray-100 text-gray-700',
	done: 'bg-emerald-100 text-emerald-700',
}

export default async function DashboardPage() {
	const session = await requireActiveSubscription()

	const { clinic } = session

	// Get subscription info for plan badge
	const subscription = await checkSubscription(clinic.id)

	const [metrics, additionalMetrics, recentConversations, notifications] = await Promise.all([
		getMetrics(clinic.id),
		getAdditionalMetrics(clinic.id),
		getRecentConversations(clinic.id),
		getRecentNotifications(clinic.id),
	])

	const cards = [
		{
			title: 'Novas hoje',
			value: metrics.newToday,
			icon: MessageSquare,
			color: 'from-sky-500 to-blue-500',
		},
		{
			title: 'Aguardando',
			value: metrics.waiting,
			icon: Clock,
			color: 'from-orange-500 to-amber-500',
		},
		{
			title: 'Agendadas',
			value: metrics.scheduled,
			icon: Calendar,
			color: 'from-purple-500 to-pink-500',
		},
		{
			title: 'Finalizadas',
			value: metrics.done,
			icon: CheckCircle,
			color: 'from-green-500 to-emerald-500',
		},
	]

	const secondaryCards = [
		{
			title: 'Tempo médio de resposta',
			value: additionalMetrics.avgResponseTime,
			icon: Timer,
			color: 'text-cyan-600',
		},
		{
			title: 'Conversas em aberto',
			value: additionalMetrics.openConversations,
			icon: MessagesSquare,
			color: 'text-indigo-600',
		},
		{
			title: 'Presenças confirmadas',
			value: additionalMetrics.confirmedThisMonth,
			icon: UserCheck,
			color: 'text-teal-600',
		},
	]

	return (
		<div className="p-4 sm:p-6 lg:p-8">
			{/* Header with Plan Badge */}
			<div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
					<p className="text-sm text-neutral-500 mt-1">
						Visão geral do seu atendimento
					</p>
				</div>
				<Link
					href="/dashboard/billing"
					className="group flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm shadow-sm transition-all duration-200 hover:border-neutral-300 hover:shadow"
				>
					<span className="flex size-2 rounded-full bg-emerald-400" />
					<span className="font-medium text-neutral-700 group-hover:text-neutral-900 transition-colors">
						{subscription.planKey ? subscription.planKey.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Sem plano'}
					</span>
					<span className="text-neutral-300">|</span>
					<span className="text-neutral-500 group-hover:text-neutral-700 transition-colors">
						Gerenciar
					</span>
					<ChevronRight className="size-3.5 text-neutral-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-600" />
				</Link>
			</div>

			{/* Cards principais de métricas */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
				{cards.map((card) => {
					const Icon = card.icon
					return (
						<div
							key={card.title}
							className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<p className="text-sm font-medium text-neutral-600">
										{card.title}
									</p>
									<p className="mt-2 text-3xl font-bold text-neutral-900">
										{card.value}
									</p>
								</div>
								<div
									className={`flex size-12 items-center justify-center rounded-lg bg-gradient-to-br ${card.color} shadow-md`}
								>
									<Icon className="size-6 text-white" />
								</div>
							</div>
						</div>
					)
				})}
			</div>

			{/* Cards secundários de métricas */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
				{secondaryCards.map((card) => {
					const Icon = card.icon
					const hasNoData = card.value === '—'
					return (
						<div
							key={card.title}
							className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
						>
							<div className="flex items-center gap-3">
								<div className={`${card.color}`}>
									<Icon className="size-5" />
								</div>
								<div className="flex-1">
									<p className="text-xs font-medium text-neutral-500">
										{card.title}
									</p>
									{hasNoData ? (
										<div>
											<p className="mt-0.5 text-lg font-semibold text-neutral-400">
												{card.value}
											</p>
											<p className="text-[10px] text-neutral-400">
												sem dados ainda
											</p>
										</div>
									) : (
										<p className="mt-0.5 text-2xl font-semibold text-neutral-900">
											{card.value}
										</p>
									)}
								</div>
							</div>
						</div>
					)
				})}
			</div>


			{/* Seção de duas colunas: Últimas conversas e Notificações */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
				{/* Últimas conversas */}
				<div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
					<div className="border-b border-neutral-200 px-5 py-4">
						<h2 className="text-base font-semibold text-neutral-900">
							Últimas conversas
						</h2>
					</div>
					<div className="divide-y divide-neutral-200">
						{recentConversations.length > 0 ? (
							recentConversations.map((conversation) => (
								<div
									key={conversation.id}
									className="px-5 py-3 hover:bg-neutral-50 transition-colors"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1 min-w-0">
											<p className="font-medium text-neutral-900 truncate text-sm">
												{conversation.patient_name || conversation.patient_phone}
											</p>
											<div className="flex items-center gap-2 mt-1">
												<span
													className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[conversation.status] ||
														'bg-gray-100 text-gray-700'
														}`}
												>
													{statusLabels[conversation.status] || conversation.status}
												</span>
											</div>
										</div>
										<span className="text-xs text-neutral-400 whitespace-nowrap">
											{formatRelativeTime(
												conversation.last_message_at || conversation.created_at
											)}
										</span>
									</div>
								</div>
							))
						) : (
							<div className="px-5 py-12 text-center">
								<MessageSquare className="size-10 text-neutral-300 mx-auto mb-3" />
								<p className="text-sm text-neutral-500 mb-4">
									Nenhuma conversa recente
								</p>
								<Link
									href="/dashboard/conversas"
									className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
								>
									Ir para Conversas
									<ArrowRight className="size-4" />
								</Link>
							</div>
						)}
					</div>
				</div>

				{/* Últimas notificações */}
				<div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
					<div className="border-b border-neutral-200 px-5 py-4">
						<h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
							<Bell className="size-4" />
							Últimas notificações
						</h2>
					</div>
					<div className="divide-y divide-neutral-200">
						{notifications.map((notification) => {
							const Icon = getNotificationIcon(notification.type)
							return (
								<div
									key={notification.id}
									className="px-5 py-3 hover:bg-neutral-50 transition-colors"
								>
									<div className="flex items-start gap-3">
										<div className="mt-0.5">
											<Icon className="size-4 text-neutral-400" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm text-neutral-700">
												{notification.text}
											</p>
										</div>
										<span className="text-xs text-neutral-400 whitespace-nowrap">
											{formatRelativeTime(notification.time)}
										</span>
									</div>
								</div>
							)
						})}
					</div>
				</div>
			</div>
		</div>
	)
}

