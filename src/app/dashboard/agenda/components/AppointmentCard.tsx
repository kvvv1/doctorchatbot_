'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, Clock, Phone, User } from 'lucide-react'

interface AppointmentCardProps {
  appointment: {
    id: string
    patient_name: string
    patient_phone: string
    starts_at: string
    ends_at: string
    status: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show'
    description?: string
  }
  onClick: () => void
}

export default function AppointmentCard({ appointment, onClick }: AppointmentCardProps) {
  const statusConfig = {
    scheduled: {
      label: 'Agendado',
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      border: 'border-purple-200',
    },
    confirmed: {
      label: 'Confirmado',
      bg: 'bg-green-100',
      text: 'text-green-700',
      border: 'border-green-200',
    },
    canceled: {
      label: 'Cancelado',
      bg: 'bg-red-100',
      text: 'text-red-700',
      border: 'border-red-200',
    },
    completed: {
      label: 'Concluído',
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-200',
    },
    no_show: {
      label: 'Faltou',
      bg: 'bg-orange-100',
      text: 'text-orange-700',
      border: 'border-orange-200',
    },
  }

  const config = statusConfig[appointment.status]
  const startDate = new Date(appointment.starts_at)
  const endDate = new Date(appointment.ends_at)

  return (
    <button
      onClick={onClick}
      className={`
        w-full rounded-lg border ${config.border} bg-white p-4
        text-left shadow-sm transition-all hover:shadow-md
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-neutral-500" />
            <span className="font-semibold text-neutral-900">{appointment.patient_name}</span>
          </div>

          <div className="flex items-center gap-2 mb-1 text-sm text-neutral-600">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(startDate, "d 'de' MMMM", { locale: ptBR })}</span>
          </div>

          <div className="flex items-center gap-2 mb-2 text-sm text-neutral-600">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Phone className="h-3.5 w-3.5" />
            <span>{appointment.patient_phone}</span>
          </div>

          {appointment.description && (
            <p className="mt-2 text-sm text-neutral-500 line-clamp-2">{appointment.description}</p>
          )}
        </div>

        <span
          className={`
            inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium
            ${config.bg} ${config.text}
          `}
        >
          {config.label}
        </span>
      </div>
    </button>
  )
}
