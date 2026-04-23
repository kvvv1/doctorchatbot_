'use client'

import { useState } from 'react'
import {
	DndContext,
	closestCenter,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core'
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
	arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BotSettings } from '@/lib/types/database'
import { ChevronDown, GripVertical } from 'lucide-react'

interface BotMenuOptionsEditorProps {
	settings: BotSettings
	onChange: (settings: BotSettings) => void
}

type MenuKey = keyof NonNullable<BotSettings['menu_options']>

interface MenuOption {
	key: MenuKey
	label: string
	description: string
	emoji: string
}

const MENU_OPTIONS_MAP: Record<MenuKey, Omit<MenuOption, 'key'>> = {
	schedule: {
		label: 'Agendar consulta',
		description: 'Pacientes podem agendar novas consultas',
		emoji: '📅',
	},
	schedule_exam: {
		label: 'Agendar exame',
		description: 'Pacientes podem iniciar agendamento de exames',
		emoji: '🧪',
	},
	view_appointments: {
		label: 'Ver meus agendamentos',
		description: 'Pacientes podem visualizar seus agendamentos',
		emoji: '👁️',
	},
	reschedule: {
		label: 'Remarcar consulta',
		description: 'Pacientes podem mudar data/hora de consultas',
		emoji: '🔄',
	},
	cancel: {
		label: 'Cancelar consulta',
		description: 'Pacientes podem cancelar suas consultas',
		emoji: '❌',
	},
	attendant: {
		label: 'Falar com secretária',
		description: 'Pacientes podem solicitar atendimento humano',
		emoji: '👤',
	},
	waitlist: {
		label: 'Lista de espera',
		description: 'Pacientes podem entrar na lista de espera por horários',
		emoji: '📋',
	},
}

const DEFAULT_ORDER: MenuKey[] = [
	'schedule',
	'schedule_exam',
	'view_appointments',
	'reschedule',
	'cancel',
	'attendant',
	'waitlist',
]

const DEFAULT_OPTIONS: NonNullable<BotSettings['menu_options']> = {
	schedule: true,
	schedule_exam: false,
	view_appointments: true,
	reschedule: true,
	cancel: true,
	attendant: true,
	waitlist: false,
}

interface SortableRowProps {
	option: MenuOption
	position: number
	enabled: boolean
	onToggle: (key: MenuKey) => void
}

function SortableRow({ option, position, enabled, onToggle }: SortableRowProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: option.key,
	})

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		zIndex: isDragging ? 10 : undefined,
		opacity: isDragging ? 0.85 : 1,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`flex items-center gap-3 rounded-lg border bg-white p-3 transition-colors ${
				isDragging ? 'border-blue-400 shadow-md' : 'border-slate-200 hover:border-blue-300'
			}`}
		>
			<button
				type="button"
				{...attributes}
				{...listeners}
				className="touch-none flex-shrink-0 cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
				aria-label="Arrastar para reordenar"
			>
				<GripVertical className="h-5 w-5" />
			</button>

			<span
				className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
					enabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
				}`}
			>
				{enabled ? position : '—'}
			</span>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-base">{option.emoji}</span>
					<span
						className={`text-sm font-medium ${enabled ? 'text-slate-800' : 'text-slate-400'}`}
					>
						{option.label}
					</span>
				</div>
				<p className="mt-0.5 truncate text-xs text-slate-400">{option.description}</p>
			</div>

			<button
				type="button"
				onClick={() => onToggle(option.key)}
				className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
					enabled ? 'bg-blue-600' : 'bg-slate-300'
				}`}
			>
				<span
					className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
						enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
					}`}
				/>
			</button>
		</div>
	)
}

export default function BotMenuOptionsEditor({ settings, onChange }: BotMenuOptionsEditorProps) {
	const [isOpen, setIsOpen] = useState(false)

	const menuOptions = settings.menu_options ?? DEFAULT_OPTIONS
	const storedOrder: MenuKey[] = (settings.menu_order as MenuKey[] | undefined) ?? DEFAULT_ORDER
	const allKnownKeys = Object.keys(MENU_OPTIONS_MAP) as MenuKey[]
	const missingKeys = allKnownKeys.filter((key) => !storedOrder.includes(key))
	const menuOrder: MenuKey[] = [...storedOrder, ...missingKeys]

	const orderedOptions: MenuOption[] = menuOrder
		.filter((key): key is MenuKey => key in MENU_OPTIONS_MAP)
		.map((key) => ({ key, ...MENU_OPTIONS_MAP[key] }))

	function getPosition(key: MenuKey): number {
		let position = 0
		for (const currentKey of menuOrder) {
			if (menuOptions[currentKey as MenuKey]) position += 1
			if (currentKey === key) return position
		}
		return position
	}

	const enabledCount = menuOrder.filter((key) => menuOptions[key as MenuKey]).length

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
	)

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const oldIndex = menuOrder.indexOf(active.id as MenuKey)
		const newIndex = menuOrder.indexOf(over.id as MenuKey)
		onChange({ ...settings, menu_order: arrayMove(menuOrder, oldIndex, newIndex) })
	}

	const handleToggle = (key: MenuKey) => {
		onChange({
			...settings,
			menu_options: { ...menuOptions, [key]: !menuOptions[key] },
		})
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-slate-50"
			>
				<div className="flex items-center gap-3">
					<span className="text-xl">📋</span>
					<div className="text-left">
						<h3 className="font-semibold text-slate-800">Opções do Menu Principal</h3>
						<p className="text-xs text-slate-500">
							{enabledCount} de {menuOrder.length} opções habilitadas
						</p>
					</div>
				</div>
				<ChevronDown
					className={`h-5 w-5 text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
				/>
			</button>

			{isOpen && (
				<div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
					<p className="mb-4 text-sm text-slate-600">
						Arraste as linhas para reordenar. Ative ou desative cada opção com o toggle.
					</p>

					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext items={menuOrder} strategy={verticalListSortingStrategy}>
							<div className="space-y-2">
								{orderedOptions.map((option) => (
									<SortableRow
										key={option.key}
										option={option}
										position={getPosition(option.key)}
										enabled={!!menuOptions[option.key]}
										onToggle={handleToggle}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>

					<div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
						<p className="text-xs text-blue-800">
							<strong>💡 Dica:</strong> A numeração no WhatsApp reflete a ordem e somente as opções ativadas.
						</p>
					</div>

					{!!menuOptions.waitlist && (
						<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1">
									<p className="text-sm font-medium text-amber-900">
										🔔 Notificações automáticas de encaixe
									</p>
									<p className="mt-1 text-xs text-amber-700">
										Quando ativado, o bot notifica automaticamente o próximo paciente da lista de espera ao surgir um horário livre.
									</p>
								</div>
								<button
									type="button"
									onClick={() =>
										onChange({
											...settings,
											waitlist_notifications_enabled:
												!(settings.waitlist_notifications_enabled ?? true),
										})
									}
									className={`relative mt-0.5 inline-flex h-5 w-9 items-center rounded-full transition-colors ${
										(settings.waitlist_notifications_enabled ?? true)
											? 'bg-amber-500'
											: 'bg-slate-300'
									}`}
								>
									<span
										className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
											(settings.waitlist_notifications_enabled ?? true)
												? 'translate-x-[18px]'
												: 'translate-x-[3px]'
										}`}
									/>
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
