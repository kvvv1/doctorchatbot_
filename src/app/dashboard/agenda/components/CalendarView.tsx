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

type AppointmentStatus = 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show'

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: {
    status: AppointmentStatus
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

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string; dot: string }> = {
  scheduled: { bg: '#faf5ff', border: '#9333ea', text: '#6b21a8', dot: '#9333ea' },
  confirmed:  { bg: '#f0fdf4', border: '#16a34a', text: '#14532d', dot: '#16a34a' },
  canceled:   { bg: '#fff1f2', border: '#e11d48', text: '#9f1239', dot: '#e11d48' },
  completed:  { bg: '#eff6ff', border: '#2563eb', text: '#1e3a8a', dot: '#2563eb' },
  no_show:    { bg: '#fff7ed', border: '#ea580c', text: '#7c2d12', dot: '#ea580c' },
}

/** Evento customizado – exibe hora + nome do paciente com legibilidade máxima */
function CustomEvent({ event }: { event: CalendarEvent }) {
  const colors = STATUS_COLORS[event.resource.status]
  const timeStr = format(event.start, 'HH:mm')
  const name = event.resource.patient_name

  return (
    <div style={{ lineHeight: 1.3, overflow: 'hidden' }}>
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          opacity: 0.8,
          display: 'block',
          color: colors.text,
        }}
      >
        {timeStr}
      </span>
      <span
        style={{
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: colors.text,
        }}
      >
        {name}
      </span>
    </div>
  )
}

/** Evento na view Agenda – mais espaço, mostra descrição se houver */
function AgendaEvent({ event }: { event: CalendarEvent }) {
  const colors = STATUS_COLORS[event.resource.status]
  const STATUS_LABEL: Record<AppointmentStatus, string> = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    canceled: 'Cancelado',
    completed: 'Concluído',
    no_show: 'Faltou',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: colors.dot,
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.9rem' }}>
        {event.resource.patient_name}
      </span>
      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 600,
          padding: '1px 7px',
          borderRadius: 999,
          backgroundColor: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
        }}
      >
        {STATUS_LABEL[event.resource.status]}
      </span>
      {event.resource.description && (
        <span style={{ fontSize: '0.8rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.resource.description}
        </span>
      )}
    </div>
  )
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
    const colors = STATUS_COLORS[event.resource.status]

    return {
      style: {
        backgroundColor: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: '6px',
        padding: '4px 8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
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
    event: 'Paciente',
    noEventsInRange: 'Nenhum agendamento neste período.',
    showMore: (total: number) => `+${total} mais`,
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
        components={{
          event: CustomEvent,
          agenda: {
            event: AgendaEvent,
          },
        }}
        views={['month', 'week', 'day', 'agenda']}
        step={15}
        timeslots={4}
        min={new Date(2024, 0, 1, 7, 0, 0)}
        max={new Date(2024, 0, 1, 20, 0, 0)}
        formats={{
          timeGutterFormat: 'HH:mm',
          eventTimeRangeFormat: ({ start, end }) =>
            `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`,
          agendaTimeRangeFormat: ({ start, end }) =>
            `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`,
          dayHeaderFormat: (date) =>
            format(date, "EEEE, d 'de' MMMM", { locale: ptBR }),
          dayRangeHeaderFormat: ({ start, end }) =>
            `${format(start, "d 'de' MMM", { locale: ptBR })} – ${format(end, "d 'de' MMM", { locale: ptBR })}`,
        }}
      />
    </div>
  )
}
