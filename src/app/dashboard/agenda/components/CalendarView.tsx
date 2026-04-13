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

// Cores sólidas para máxima legibilidade nas views de semana/dia
const STATUS_COLORS: Record<AppointmentStatus, { solid: string; dark: string; light: string; lightText: string; dot: string }> = {
  scheduled: { solid: '#9333ea', dark: '#7e22ce', light: '#faf5ff', lightText: '#6b21a8', dot: '#9333ea' },
  confirmed:  { solid: '#16a34a', dark: '#15803d', light: '#f0fdf4', lightText: '#14532d', dot: '#16a34a' },
  canceled:   { solid: '#dc2626', dark: '#b91c1c', light: '#fff1f2', lightText: '#9f1239', dot: '#dc2626' },
  completed:  { solid: '#2563eb', dark: '#1d4ed8', light: '#eff6ff', lightText: '#1e3a8a', dot: '#2563eb' },
  no_show:    { solid: '#ea580c', dark: '#c2410c', light: '#fff7ed', lightText: '#7c2d12', dot: '#ea580c' },
}

/**
 * Evento para views de tempo (semana/dia) – rbc já mostra a hora via rbc-event-label,
 * então aqui exibimos apenas o nome do paciente em destaque.
 */
function CustomEvent({ event }: { event: CalendarEvent }) {
  const name = event.resource.patient_name

  return (
    <span
      style={{
        display: 'block',
        fontWeight: 700,
        fontSize: '0.82rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}
    >
      {name}
    </span>
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
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 999,
          backgroundColor: colors.solid,
          color: '#fff',
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
        backgroundColor: colors.solid,
        borderLeft: `4px solid ${colors.dark}`,
        borderRadius: '6px',
        padding: '3px 7px',
        color: '#ffffff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
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
        toolbar={false}
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
