'use client'

import { useState, useEffect, useCallback } from 'react'
import { View } from 'react-big-calendar'
import { Plus, RefreshCw } from 'lucide-react'
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

interface AgendaPageClientProps {
  initialAppointments: Appointment[]
}

export default function AgendaPageClient({ initialAppointments }: AgendaPageClientProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments)
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
    title: apt.patient_name,
    start: new Date(apt.starts_at),
    end: new Date(apt.ends_at),
    resource: {
      status: apt.status,
      patient_name: apt.patient_name,
      patient_phone: apt.patient_phone,
      description: apt.description,
    },
  }))

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
  }, [date, view])

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
          <div className="hidden sm:block text-sm text-neutral-600">
            {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
          </div>
          <ExportMenu />
        </div>
      </div>

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
