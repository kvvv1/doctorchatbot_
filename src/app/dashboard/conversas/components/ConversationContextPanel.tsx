'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
	Calendar,
	Clock3,
	ExternalLink,
	FileText,
	HandMetal,
	StickyNote,
	X,
} from 'lucide-react'
import type { Conversation } from '@/lib/types/database'
import { usePatientAppointments } from '@/lib/hooks/usePatientAppointments'
import StatusBadge from './StatusBadge'

interface ConversationContextPanelProps {
	conversation: Conversation | null
	variant?: 'desktop' | 'mobile'
	isOpen?: boolean
	onClose?: () => void
	onOpenNotes: () => void
	onOpenSchedule: () => void
	onExportHistory: () => void
	onOpenWhatsApp: () => void
	onTakeOver: () => void
	onReturnToBot: () => void
}

function getInitials(name: string | null, phone: string) {
	if (name) {
		const parts = name.trim().split(' ')
		return parts.length >= 2
			? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
			: name.slice(0, 2).toUpperCase()
	}

	return phone.slice(-2)
}

function formatDateTime(value: string) {
	return format(new Date(value), "dd 'de' MMM, HH:mm", { locale: ptBR })
}

function PanelBody({
	conversation,
	onOpenNotes,
	onOpenSchedule,
	onExportHistory,
	onOpenWhatsApp,
	onTakeOver,
	onReturnToBot,
}: Omit<ConversationContextPanelProps, 'variant' | 'isOpen' | 'onClose'>) {
	const { appointments, loading } = usePatientAppointments({
		patientPhone: conversation?.patient_phone,
		enabled: Boolean(conversation),
	})
	const [referenceTimestamp] = useState(() => Date.now())

	if (!conversation) {
		return (
			<div className="flex h-full items-center justify-center px-6 text-center">
				<div>
					<div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-500">
						+
					</div>
					<p className="text-sm font-medium text-neutral-700">Contexto do paciente</p>
					<p className="mt-1 text-xs text-neutral-500">
						Selecione uma conversa para ver detalhes, notas e agenda.
					</p>
				</div>
			</div>
		)
	}

	const nextAppointment = appointments
		.filter((appointment) => new Date(appointment.starts_at).getTime() >= referenceTimestamp)
		.sort((left, right) => {
			return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
		})[0]

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-neutral-200 px-5 py-5">
				<div className="flex items-center gap-3">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-sm font-semibold text-emerald-700">
						{getInitials(conversation.patient_name, conversation.patient_phone)}
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold text-neutral-900">
							{conversation.patient_name || 'Sem nome'}
						</p>
						<p className="truncate text-xs text-neutral-500">{conversation.patient_phone}</p>
						<div className="mt-2 flex items-center gap-2">
							<StatusBadge status={conversation.status} />
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
									conversation.bot_enabled
										? 'bg-emerald-100 text-emerald-700'
										: 'bg-amber-100 text-amber-700'
								}`}
							>
								{conversation.bot_enabled ? 'Bot ativo' : 'Humano ativo'}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
				<section className="space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
							Próximo agendamento
						</h3>
						<button
							type="button"
							onClick={onOpenSchedule}
							className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
						>
							Agendar
						</button>
					</div>

					<div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
						{loading ? (
							<div className="space-y-2">
								<div className="h-4 w-24 animate-pulse rounded bg-neutral-100" />
								<div className="h-3 w-36 animate-pulse rounded bg-neutral-100" />
							</div>
						) : nextAppointment ? (
							<div className="space-y-3">
								<div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
									<Calendar className="size-4 text-emerald-600" />
									{formatDateTime(nextAppointment.starts_at)}
								</div>
								<div className="flex items-center gap-2 text-xs text-neutral-500">
									<Clock3 className="size-3.5" />
									{nextAppointment.status === 'confirmed' ? 'Confirmado' : 'Pendente de confirmação'}
								</div>
							</div>
						) : (
							<p className="text-sm text-neutral-500">
								Nenhum agendamento futuro encontrado para este paciente.
							</p>
						)}
					</div>
				</section>

				<section className="space-y-3">
					<h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
						Atalhos discretos
					</h3>
					<div className="grid grid-cols-2 gap-3">
						<button
							type="button"
							onClick={onOpenNotes}
							className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
						>
							<StickyNote className="size-4 text-neutral-500" />
							Notas
						</button>
						<button
							type="button"
							onClick={onExportHistory}
							className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
						>
							<FileText className="size-4 text-neutral-500" />
							Exportar
						</button>
						<button
							type="button"
							onClick={onOpenWhatsApp}
							className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
						>
							<ExternalLink className="size-4 text-neutral-500" />
							WhatsApp
						</button>
						<button
							type="button"
							onClick={conversation.bot_enabled ? onTakeOver : onReturnToBot}
							className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium shadow-sm transition-colors ${
								conversation.bot_enabled
									? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
									: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
							}`}
						>
							<HandMetal className="size-4" />
							{conversation.bot_enabled ? 'Assumir' : 'Devolver'}
						</button>
					</div>
				</section>

				<section className="space-y-3">
					<h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
						Notas da conversa
					</h3>
					<div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
						{conversation.notes ? (
							<p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
								{conversation.notes}
							</p>
						) : (
							<p className="text-sm text-neutral-500">
								Sem notas ainda. Use o atalho acima para registrar contexto do paciente.
							</p>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}

export default function ConversationContextPanel({
	conversation,
	variant = 'desktop',
	isOpen = true,
	onClose,
	onOpenNotes,
	onOpenSchedule,
	onExportHistory,
	onOpenWhatsApp,
	onTakeOver,
	onReturnToBot,
}: ConversationContextPanelProps) {
	if (variant === 'mobile') {
		if (!isOpen) return null

		return (
			<div className="fixed inset-0 z-50 flex items-end bg-black/40 xl:hidden">
				<div className="absolute inset-0" onClick={onClose} />
				<div className="relative z-10 max-h-[80vh] w-full rounded-t-[28px] bg-neutral-50 shadow-2xl">
					<div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
						<div>
							<p className="text-sm font-semibold text-neutral-900">Contexto do paciente</p>
							<p className="text-xs text-neutral-500">Ações rápidas e contexto operacional</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="flex size-9 items-center justify-center rounded-full bg-white text-neutral-500 shadow-sm"
						>
							<X className="size-4" />
						</button>
					</div>
					<div className="max-h-[calc(80vh-72px)] overflow-y-auto">
						<PanelBody
							conversation={conversation}
							onOpenNotes={onOpenNotes}
							onOpenSchedule={onOpenSchedule}
							onExportHistory={onExportHistory}
							onOpenWhatsApp={onOpenWhatsApp}
							onTakeOver={onTakeOver}
							onReturnToBot={onReturnToBot}
						/>
					</div>
				</div>
			</div>
		)
	}

	return (
		<aside className="hidden h-full w-[320px] border-l border-neutral-200 bg-neutral-50 xl:block">
			<PanelBody
				conversation={conversation}
				onOpenNotes={onOpenNotes}
				onOpenSchedule={onOpenSchedule}
				onExportHistory={onExportHistory}
				onOpenWhatsApp={onOpenWhatsApp}
				onTakeOver={onTakeOver}
				onReturnToBot={onReturnToBot}
			/>
		</aside>
	)
}
