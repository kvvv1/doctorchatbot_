'use client'

import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = {
  'pt-BR': ptBR,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales,
})

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: {
    status: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show'
    patient_name: string
    patient_phone: string
    description?: string
    professional_id?: string
  }
}

interface CalendarViewProps {
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void
  view: View
  onViewChange: (view: View) => void
  date: Date
  onNavigate: (date: Date) => void
}

export default function CalendarView({
  events,
  onSelectEvent,
  onSelectSlot,
  view,
  onViewChange,
  date,
  onNavigate,
}: CalendarViewProps) {
  const eventStyleGetter = (event: CalendarEvent) => {
    const statusColors = {
      scheduled: { bg: '#f3e8ff', border: '#9333ea', text: '#6b21a8' },
      confirmed: { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
      canceled: { bg: '#fee2e2', border: '#dc2626', text: '#991b1b' },
      completed: { bg: '#dbeafe', border: '#2563eb', text: '#1e40af' },
      no_show: { bg: '#fed7aa', border: '#ea580c', text: '#c2410c' },
    }

    const colors = statusColors[event.resource.status]

    return {
      style: {
        backgroundColor: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        color: colors.text,
        borderRadius: '6px',
        padding: '4px 8px',
        fontSize: '0.875rem',
        fontWeight: '500',
      },
    }
  }

  const messages = {
    today: 'Hoje',
    previous: 'Anterior',
    next: 'Próximo',
    month: 'Mês',
    week: 'Semana',
    day: 'Dia',
    agenda: 'Agenda',
    date: 'Data',
    time: 'Hora',
    event: 'Evento',
    noEventsInRange: 'Não há agendamentos neste período',
    showMore: (total: number) => `+ ${total} mais`,
  }

  return (
    <div className="h-[calc(100vh-280px)] min-h-[600px]">
      <BigCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        culture="pt-BR"
        messages={messages}
        view={view}
        onView={onViewChange}
        date={date}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
        onSelectSlot={onSelectSlot}
        selectable
        eventPropGetter={eventStyleGetter}
        views={['month', 'week', 'day', 'agenda']}
        step={15}
        timeslots={4}
        min={new Date(2024, 0, 1, 7, 0, 0)}
        max={new Date(2024, 0, 1, 20, 0, 0)}
        formats={{
          timeGutterFormat: 'HH:mm',
          eventTimeRangeFormat: ({ start, end }) =>
            `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`,
          agendaTimeRangeFormat: ({ start, end }) =>
            `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`,
          dayHeaderFormat: (date) => format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }),
          dayRangeHeaderFormat: ({ start, end }) =>
            `${format(start, 'dd MMM', { locale: ptBR })} - ${format(end, 'dd MMM', { locale: ptBR })}`,
        }}
      />
    </div>
  )
}
