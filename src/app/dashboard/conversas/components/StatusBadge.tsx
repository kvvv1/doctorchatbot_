import type { ConversationStatus } from '@/lib/types/database'

interface StatusBadgeProps {
	status: ConversationStatus
	size?: 'sm' | 'md'
}

const statusConfig: Record<ConversationStatus, { label: string; colors: string }> = {
	new: {
		label: 'Nova',
		colors: 'bg-sky-100 text-sky-700 border-sky-200',
	},
	in_progress: {
		label: 'Em andamento',
		colors: 'bg-indigo-100 text-indigo-700 border-indigo-200',
	},
	waiting_patient: {
		label: 'Aguardando',
		colors: 'bg-amber-100 text-amber-700 border-amber-200',
	},
	scheduled: {
		label: 'Agendada',
		colors: 'bg-purple-100 text-purple-700 border-purple-200',
	},
	reschedule: {
		label: 'Reagendar',
		colors: 'bg-orange-100 text-orange-700 border-orange-200',
	},
	canceled: {
		label: 'Cancelada',
		colors: 'bg-red-100 text-red-700 border-red-200',
	},
	waitlist: {
		label: 'Lista espera',
		colors: 'bg-neutral-100 text-neutral-900 border-neutral-200',
	},
	waiting_human: {
		label: 'Com atendente',
		colors: 'bg-rose-100 text-rose-700 border-rose-200',
	},
	done: {
		label: 'Concluída',
		colors: 'bg-emerald-100 text-emerald-700 border-emerald-200',
	},
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
	const config = statusConfig[status]
	const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'

	return (
		<span
			className={`inline-flex items-center rounded-full border font-semibold ${config.colors} ${sizeClasses}`}
		>
			{config.label}
		</span>
	)
}
