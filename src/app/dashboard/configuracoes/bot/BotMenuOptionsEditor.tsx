'use client'

import type { BotSettings } from '@/lib/types/database'

interface BotMenuOptionsEditorProps {
	settings: BotSettings
	onChange: (settings: BotSettings) => void
}

interface MenuOption {
	key: keyof NonNullable<BotSettings['menu_options']>
	label: string
	description: string
	emoji: string
}

const MENU_OPTIONS: MenuOption[] = [
	{
		key: 'schedule',
		label: '1️⃣ Agendar consulta',
		description: 'Permitir que pacientes agendem novas consultas',
		emoji: '📅',
	},
	{
		key: 'view_appointments',
		label: '2️⃣ Ver meus agendamentos',
		description: 'Permitir que pacientes visualizem seus agendamentos',
		emoji: '👁️',
	},
	{
		key: 'reschedule',
		label: '3️⃣ Remarcar consulta',
		description: 'Permitir que pacientes mudem data/hora de consultas',
		emoji: '🔄',
	},
	{
		key: 'cancel',
		label: '4️⃣ Cancelar consulta',
		description: 'Permitir que pacientes cancelem suas consultas',
		emoji: '❌',
	},
	{
		key: 'attendant',
		label: '5️⃣ Falar com atendente',
		description: 'Permitir que pacientes solicitem atendimento humano',
		emoji: '👤',
	},
]

export default function BotMenuOptionsEditor({ settings, onChange }: BotMenuOptionsEditorProps) {
	const menuOptions = settings.menu_options || {
		schedule: true,
		view_appointments: true,
		reschedule: true,
		cancel: true,
		attendant: true,
	}

	const handleToggleOption = (key: keyof NonNullable<BotSettings['menu_options']>) => {
		const updated = {
			...settings,
			menu_options: {
				...menuOptions,
				[key]: !menuOptions[key],
			},
		}
		onChange(updated)
	}

	return (
		<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
			<h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
				<span className="text-2xl">📋</span>
				Opções do Menu
			</h2>

			<p className="text-sm text-slate-600 mb-6">
				Selecione quais opções devem aparecer no menu principal do bot. O menu será gerado automaticamente com as opções ativadas.
			</p>

			<div className="space-y-3">
				{MENU_OPTIONS.map((option) => (
					<div
						key={option.key}
						className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
					>
						<div className="flex-1">
							<div className="flex items-center gap-2 mb-1">
								<span className="text-lg">{option.emoji}</span>
								<label
									htmlFor={`menu-option-${option.key}`}
									className="font-medium text-slate-700 cursor-pointer"
								>
									{option.label}
								</label>
							</div>
							<p className="text-sm text-slate-500 ml-7">{option.description}</p>
						</div>

						<button
							id={`menu-option-${option.key}`}
							type="button"
							onClick={() => handleToggleOption(option.key)}
							className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 flex-shrink-0 ${
								menuOptions[option.key] ? 'bg-blue-600' : 'bg-slate-300'
							}`}
						>
							<span
								className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
									menuOptions[option.key] ? 'translate-x-6' : 'translate-x-1'
								}`}
							/>
						</button>
					</div>
				))}
			</div>

			<div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
				<p className="text-sm text-blue-800">
					<strong>💡 Dica:</strong> O menu será exibido no WhatsApp com apenas as opções ativadas acima. Você pode desativar opções que não deseja oferecer no momento.
				</p>
			</div>
		</div>
	)
}
