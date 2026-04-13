'use client'

import { useState, useEffect, useCallback } from 'react'
import { View } from 'react-big-calendar'
import { Bot, Plus, RefreshCw } from 'lucide-react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays } from 'date-fns'
import CalendarView from './components/CalendarView'
import ViewSwitcher from './components/ViewSwitcher'
import AppointmentDetailsModal from './components/AppointmentDetailsModal'
import CreateAppointmentModal from './components/CreateAppointmentModal'
import { ExportMenu } from './components/ExportMenu'

interface Appointment {
  id: string
  patient_name: string
  patient_phone: string
  starts_at: string
  ends_at: string
  status: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show'
  description?: string
  conversation_id?: string
  provider: string
  provider_reference_id?: string
}

type AppointmentUpdatePayload = {
  starts_at?: string
  ends_at?: string
  description?: string
}

type SourceFilter = 'all' | 'bot' | 'manual' | 'google' | 'gestaods'

function isBotAppointment(appointment: Appointment): boolean {
  return (
    appointment.provider === 'manual' &&
    !!appointment.conversation_id &&
    (appointment.description || '').toLowerCase().includes('via whatsapp')
  )
}

interface AgendaPageClientProps {
  initialAppointments: Appointment[]
  activeProvider: 'gestaods' | 'google' | null
}

export default function AgendaPageClient({ initialAppointments, activeProvider }: AgendaPageClientProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState(new Date())
  const [loading, setLoading] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createModalDate, setCreateModalDate] = useState(new Date())

  const [todayMetrics, setTodayMetrics] = useState<{
    total: number
    confirmed: number
    completed: number
    noShow: number
  } | null>(null)
  const [monthMetrics, setMonthMetrics] = useState<{
    confirmationRate: number
    noShowRate: number
  } | null>(null)

  // Converter appointments para formato do calendário
  const calendarEvents = appointments.map((apt) => ({
    id: apt.id,
    title: `${isBotAppointment(apt) ? '🤖 ' : ''}${apt.patient_name}`,
    start: new Date(apt.starts_at),
    end: new Date(apt.ends_at),
    resource: {
      status: apt.status,
      patient_name: apt.patient_name,
      patient_phone: apt.patient_phone,
      description: apt.description,
      source: isBotAppointment(apt) ? 'bot' : apt.provider,
    },
  }))

  const botAppointmentsCount = appointments.filter(isBotAppointment).length

  // Carregar appointments do servidor
  const loadAppointments = useCallback(async () => {
    setLoading(true)
    try {
      // Calcular range baseado na view atual
      let startDate: Date
      let endDate: Date

      if (view === 'month') {
        startDate = startOfWeek(startOfMonth(date))
        endDate = endOfWeek(endOfMonth(date))
      } else if (view === 'week') {
        startDate = startOfWeek(date)
        endDate = endOfWeek(date)
      } else {
        startDate = date
        endDate = addDays(date, 1)
      }

      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      })

      if (sourceFilter !== 'all') {
        params.set('source', sourceFilter)
      }

      const response = await fetch(`/api/appointments/list?${params}`)
      const data = await response.json()

      if (data.appointments) {
        setAppointments(data.appointments)
      }
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error)
    } finally {
      setLoading(false)
    }
  }, [date, sourceFilter, view])

  // Recarregar quando view ou data mudar
  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Carregar métricas da agenda
  useEffect(() => {
    async function loadMetrics() {
      try {
        const response = await fetch('/api/appointments/metrics')
        if (!response.ok) return

        const data = await response.json()
        if (data.metrics) {
          setTodayMetrics({
            total: data.metrics.today.total,
            confirmed: data.metrics.today.confirmed,
            completed: data.metrics.today.completed,
            noShow: data.metrics.today.noShow,
          })
          setMonthMetrics({
            confirmationRate: data.metrics.month.confirmationRate,
            noShowRate: data.metrics.month.noShowRate,
          })
        }
      } catch (error) {
        console.error('Erro ao carregar métricas da agenda:', error)
      } finally {
        // nada
      }
    }

    loadMetrics()
  }, [])

  const handleSelectEvent = (event: { id: string; title: string; start: Date; end: Date; resource: Record<string, unknown> }) => {
    const apt = appointments.find((a) => a.id === event.id)
    if (apt) {
      setSelectedAppointment(apt)
    }
  }

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    setCreateModalDate(slotInfo.start)
    setShowCreateModal(true)
  }

  const handleNewAppointment = () => {
    setCreateModalDate(new Date())
    setShowCreateModal(true)
  }

  const handleStatusChange = async (
    appointmentId: string,
    newStatus: Appointment['status']
  ) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Erro ao atualizar status')
      }

      // Atualizar localmente
      setAppointments((prev) =>
        prev.map((apt) => (apt.id === appointmentId ? { ...apt, status: newStatus } : apt))
      )

      // Atualizar selected se for o mesmo
      if (selectedAppointment?.id === appointmentId) {
        setSelectedAppointment({ ...selectedAppointment, status: newStatus })
      }
    } catch (error) {
      console.error('Erro ao atualizar status:', error)
      alert('Erro ao atualizar status do agendamento')
    }
  }

  const handleDeleteAppointment = async (appointmentId: string) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Erro ao cancelar agendamento')
      }

      // Remover localmente ou atualizar status
      setAppointments((prev) =>
        prev.map((apt) => (apt.id === appointmentId ? { ...apt, status: 'canceled' } : apt))
      )
      setSelectedAppointment(null)
    } catch (error) {
      console.error('Erro ao cancelar agendamento:', error)
      alert('Erro ao cancelar agendamento')
    }
  }

  const handleUpdateAppointment = async (
    appointmentId: string,
    updates: AppointmentUpdatePayload
  ) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Erro ao editar agendamento')
      }

      const data = await response.json()
      if (!data?.appointment) {
        throw new Error('Resposta inválida ao editar agendamento')
      }

      const updated = data.appointment as Appointment

      setAppointments((prev) => prev.map((apt) => (apt.id === appointmentId ? updated : apt)))
      setSelectedAppointment(updated)
    } catch (error) {
      console.error('Erro ao editar agendamento:', error)
      alert('Erro ao editar agendamento')
      throw error
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Agenda</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Gerencie seus agendamentos e horários
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAppointments}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200
              bg-white px-4 py-2 text-sm font-medium text-neutral-700
              hover:bg-neutral-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            onClick={handleNewAppointment}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600
              px-4 py-2 text-sm font-medium text-white hover:bg-sky-700
              transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* Métricas rápidas da agenda */}
    {todayMetrics && monthMetrics && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Consultas hoje</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{todayMetrics.total}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Confirmadas hoje</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {todayMetrics.confirmed}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Taxa conf. mês</p>
          <p className="mt-1 text-2xl font-bold text-sky-600">
            {monthMetrics.confirmationRate.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">No-show mês</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {monthMetrics.noShowRate.toFixed(1)}%
          </p>
        </div>
      </div>
    )}

    {/* View Switcher + Export */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ViewSwitcher currentView={view} onViewChange={setView} />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
            {([
              { key: 'all' as const, label: 'Todos' },
              { key: 'bot' as const, label: 'Bot' },
              { key: 'manual' as const, label: 'Manual' },
              ...(activeProvider === 'gestaods'
                ? [{ key: 'gestaods' as const, label: 'GestaoDS' }]
                : activeProvider === 'google'
                ? [{ key: 'google' as const, label: 'Google' }]
                : []),
            ]).map((option) => (
              <button
                key={option.key}
                onClick={() => setSourceFilter(option.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sourceFilter === option.key
                    ? 'bg-sky-600 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:block text-sm text-neutral-600">
            {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
          </div>
          <ExportMenu />
        </div>
      </div>

      {botAppointmentsCount > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-600" />
          {botAppointmentsCount} agendamento{botAppointmentsCount !== 1 ? 's' : ''} criado{botAppointmentsCount !== 1 ? 's' : ''} pelo bot neste período.
        </div>
      )}

      {/* Calendar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <CalendarView
          events={calendarEvents}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          view={view}
          onViewChange={setView}
          date={date}
          onNavigate={setDate}
        />
      </div>

      {/* Empty State */}
      {appointments.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <Plus className="h-6 w-6 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Nenhum agendamento</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Comece criando seu primeiro agendamento
          </p>
          <button
            onClick={handleNewAppointment}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600
              px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            Criar Agendamento
          </button>
        </div>
      )}

      {/* Modals */}
      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={handleStatusChange}
          onUpdate={handleUpdateAppointment}
          onDelete={handleDeleteAppointment}
        />
      )}

      {showCreateModal && (
        <CreateAppointmentModal
          initialDate={createModalDate}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            loadAppointments()
          }}
        />
      )}
    </div>
  )
}
