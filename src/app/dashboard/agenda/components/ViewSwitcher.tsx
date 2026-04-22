'use client'

import { View } from 'react-big-calendar'
import { Calendar, CalendarDays, CalendarRange, List } from 'lucide-react'

interface ViewSwitcherProps {
  currentView: View
  onViewChange: (view: View) => void
}

export default function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const views: { value: View; label: string; icon: React.ReactNode }[] = [
    { value: 'month', label: 'Mês', icon: <Calendar className="h-4 w-4" /> },
    { value: 'week', label: 'Semana', icon: <CalendarDays className="h-4 w-4" /> },
    { value: 'day', label: 'Dia', icon: <CalendarRange className="h-4 w-4" /> },
    { value: 'agenda', label: 'Lista', icon: <List className="h-4 w-4" /> },
  ]

  return (
    <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1">
      {views.map((view) => (
        <button
          key={view.value}
          onClick={() => onViewChange(view.value)}
          className={`
            inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium
            transition-colors
            ${
              currentView === view.value
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-neutral-900 hover:bg-neutral-100'
            }
          `}
        >
          {view.icon}
          <span className="hidden sm:inline">{view.label}</span>
        </button>
      ))}
    </div>
  )
}
