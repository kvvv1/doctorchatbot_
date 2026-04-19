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
	'view_appointments',
	'reschedule',
	'cancel',
	'attendant',
	'waitlist',
]

const DEFAULT_OPTIONS: NonNullable<BotSettings['menu_options']> = {
	schedule: true,
	view_appointments: true,
	reschedule: true,
	cancel: true,
	attendant: true,
	waitlist: false,
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

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
			className={`flex items-center gap-3 p-3 bg-white rounded-lg border transition-colors ${
				isDragging ? 'border-blue-400 shadow-md' : 'border-slate-200 hover:border-blue-300'
			}`}
		>
			{/* Drag handle */}
			<button
				type="button"
				{...attributes}
				{...listeners}
				className="touch-none cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 flex-shrink-0"
				aria-label="Arrastar para reordenar"
			>
				<GripVertical className="h-5 w-5" />
			</button>

			{/* Position badge — shows dynamic number based on enabled items */}
			<span
				className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
					enabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
				}`}
			>
				{enabled ? position : '—'}
			</span>

			{/* Emoji + label + description */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-base">{option.emoji}</span>
					<span
						className={`font-medium text-sm ${enabled ? 'text-slate-800' : 'text-slate-400'}`}
					>
						{option.label}
					</span>
				</div>
				<p className="text-xs text-slate-400 mt-0.5 truncate">{option.description}</p>
			</div>

			{/* Toggle */}
			<button
				type="button"
				onClick={() => onToggle(option.key)}
				className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
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

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export default function BotMenuOptionsEditor({ settings, onChange }: BotMenuOptionsEditorProps) {
	const [isOpen, setIsOpen] = useState(false)

	const menuOptions = settings.menu_options ?? DEFAULT_OPTIONS

	// Merge stored order with any new keys added to MENU_OPTIONS_MAP that the clinic
	// doesn't have yet in their saved menu_order (e.g. 'waitlist' added later).
	const storedOrder: MenuKey[] = (settings.menu_order as MenuKey[] | undefined) ?? DEFAULT_ORDER
	const allKnownKeys = Object.keys(MENU_OPTIONS_MAP) as MenuKey[]
	const missingKeys = allKnownKeys.filter((k) => !storedOrder.includes(k))
	const menuOrder: MenuKey[] = [...storedOrder, ...missingKeys]

	// Build ordered list of option objects
	const orderedOptions: MenuOption[] = menuOrder
		.filter((key): key is MenuKey => key in MENU_OPTIONS_MAP)
		.map((key) => ({ key, ...MENU_OPTIONS_MAP[key] }))

	// Dynamic position counter (only counts enabled items above current)
	function getPosition(key: MenuKey): number {
		let pos = 0
		for (const k of menuOrder) {
			if (menuOptions[k as MenuKey]) pos++
			if (k === key) return pos
		}
		return pos
	}

	const enabledCount = menuOrder.filter((k) => menuOptions[k as MenuKey]).length

	// Sensors support both pointer (desktop) and touch (mobile)
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
	)

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const oldIndex = menuOrder.indexOf(active.id as MenuKey)
		const newIndex = menuOrder.indexOf(over.id as MenuKey)
		const newOrder = arrayMove(menuOrder, oldIndex, newIndex)
		onChange({ ...settings, menu_order: newOrder })
	}

	const handleToggle = (key: MenuKey) => {
		onChange({
			...settings,
			menu_options: { ...menuOptions, [key]: !menuOptions[key] },
		})
	}

	return (
		<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
			{/* Header */}
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
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

			{/* Collapsible content */}
			{isOpen && (
				<div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
					<p className="text-sm text-slate-600 mb-4">
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

					<div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
						<p className="text-xs text-blue-800">
							<strong>💡 Dica:</strong> A numeração no WhatsApp reflete a ordem e somente as opções ativadas.
						</p>
					</div>
				</div>
			)}
		</div>
	)
}
