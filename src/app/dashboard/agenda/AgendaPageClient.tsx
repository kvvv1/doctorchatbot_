'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { View } from 'react-big-calendar'
import { Bot, Plus, RefreshCw, CheckCircle, Clock, XCircle, UserX, CalendarDays, TrendingUp, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, subDays, addMonths, subMonths, addYears, subYears, format, isToday, isSameDay, isSameMonth, getDaysInMonth, getDay, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
  patient_name?: string
  patient_phone?: string
}

type SourceFilter = 'all' | 'bot' | 'manual' | 'google' | 'gestaods'

type ToastMessage = { id: number; type: 'success' | 'error' | 'warning'; text: string }

function isBotAppointment(appointment: Appointment): boolean {
  return (
    appointment.provider === 'manual' &&
    !!appointment.conversation_id &&
    (appointment.description || '').toLowerCase().includes('via whatsapp')
  )
}

const STATUS_CONFIG = {
  scheduled:  { label: 'Agendado',   bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  confirmed:  { label: 'Confirmado', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  canceled:   { label: 'Cancelado',  bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-400'    },
  completed:  { label: 'Concluido',  bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  no_show:    { label: 'Faltou',     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
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
  const [syncing, setSyncing] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createModalDate, setCreateModalDate] = useState(new Date())
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [todayListCollapsed, setTodayListCollapsed] = useState(false)
  const [navRange, setNavRange] = useState<number>(1)
  const [showRangePicker, setShowRangePicker] = useState(false)
  const [customDaysInput, setCustomDaysInput] = useState('')
  const rangePickerRef = useRef<HTMLDivElement>(null)
  // Mini calendar state
  const [calPickerDate, setCalPickerDate] = useState(new Date())
  const [calPickerView, setCalPickerView] = useState<'days' | 'months' | 'years'>('days')

  // Keep picker month in sync when arrows navigate to a different month
  useEffect(() => {
    setCalPickerDate((prev) =>
      isSameMonth(prev, date) ? prev : startOfMonth(date)
    )
  }, [date])

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

  // Close range picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rangePickerRef.current && !rangePickerRef.current.contains(e.target as Node)) {
        setShowRangePicker(false)
      }
    }
    if (showRangePicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showRangePicker])

  const addToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, type, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  // Today's non-canceled appointments sorted by time
  const todayAppointments = appointments
    .filter((a) => isToday(new Date(a.starts_at)) && a.status !== 'canceled')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

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

  const loadAppointments = useCallback(async () => {
    setLoading(true)
    try {
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
      if (sourceFilter !== 'all') params.set('source', sourceFilter)

      const response = await fetch(`/api/appointments/list?${params}`)
      const data = await response.json()
      if (data.appointments) setAppointments(data.appointments)
    } catch {
      addToast('error', 'Erro ao carregar agendamentos.')
    } finally {
      setLoading(false)
    }
  }, [date, sourceFilter, view, addToast])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

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
      } catch {
        // silently ignore metrics errors
      }
    }
    loadMetrics()
  }, [])

  const handleSyncGestaods = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/integrations/gestaods/sync', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        addToast('error', data.error || 'Erro ao sincronizar com GestaoDS.')
      } else {
        const s = data.summary
        const count = (s?.created ?? 0) + (s?.updated ?? 0)
        addToast('success', `GestaoDS sincronizado: ${count} agendamento${count !== 1 ? 's' : ''} importado${count !== 1 ? 's' : ''}.`)
        loadAppointments()
      }
    } catch {
      addToast('error', 'Erro de conexao ao sincronizar GestaoDS.')
    } finally {
      setSyncing(false)
    }
  }

  const handleSelectEvent = (event: { id: string; title: string; start: Date; end: Date; resource: Record<string, unknown> }) => {
    const apt = appointments.find((a) => a.id === event.id)
    if (apt) setSelectedAppointment(apt)
  }

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    setCreateModalDate(slotInfo.start)
    setShowCreateModal(true)
  }

  const handleStatusChange = async (appointmentId: string, newStatus: Appointment['status']) => {
    const response = await fetch(`/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!response.ok) throw new Error('Erro ao atualizar status')
    setAppointments((prev) =>
      prev.map((apt) => (apt.id === appointmentId ? { ...apt, status: newStatus } : apt))
    )
    if (selectedAppointment?.id === appointmentId) {
      setSelectedAppointment((prev) => prev ? { ...prev, status: newStatus } : prev)
    }
  }

  const handleDeleteAppointment = async (appointmentId: string) => {
    const response = await fetch(`/api/appointments/${appointmentId}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Erro ao cancelar agendamento')
    setAppointments((prev) =>
      prev.map((apt) => (apt.id === appointmentId ? { ...apt, status: 'canceled' } : apt))
    )
    setSelectedAppointment(null)
  }

  const handleUpdateAppointment = async (appointmentId: string, updates: AppointmentUpdatePayload) => {
    const response = await fetch(`/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!response.ok) throw new Error('Erro ao editar agendamento')
    const data = await response.json()
    if (!data?.appointment) throw new Error('Resposta invalida ao editar agendamento')
    const updated = data.appointment as Appointment
    setAppointments((prev) => prev.map((apt) => (apt.id === appointmentId ? updated : apt)))
    setSelectedAppointment(updated)
  }

  return (
    <div className="space-y-5">
      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg pointer-events-auto max-w-sm ${
              t.type === 'error' ? 'bg-red-600 text-white' :
              t.type === 'warning' ? 'bg-yellow-500 text-white' :
              'bg-green-600 text-white'
            }`}
          >
            {t.type === 'error' ? <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> :
             t.type === 'warning' ? <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> :
             <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
            <span>{t.text}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="ml-auto opacity-80 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Agenda</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Gerencie suas consultas e horarios</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeProvider === 'gestaods' && (
            <button
              onClick={handleSyncGestaods}
              disabled={syncing || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar GestaoDS'}
            </button>
          )}
          <button
            onClick={loadAppointments}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            onClick={() => { setCreateModalDate(new Date()); setShowCreateModal(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* Metrics cards */}
      {todayMetrics && monthMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-1">
              <CalendarDays className="h-3.5 w-3.5" /> Hoje
            </div>
            <p className="text-2xl font-bold text-neutral-900">{todayMetrics.total}</p>
            <p className="text-xs text-neutral-400">consultas</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" /> Confirmadas
            </div>
            <p className="text-2xl font-bold text-green-600">{todayMetrics.confirmed}</p>
            <p className="text-xs text-neutral-400">hoje</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-sky-500" /> Taxa conf.
            </div>
            <p className="text-2xl font-bold text-sky-600">{monthMetrics.confirmationRate.toFixed(1)}%</p>
            <p className="text-xs text-neutral-400">este mes</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-1">
              <UserX className="h-3.5 w-3.5 text-red-500" /> No-show
            </div>
            <p className="text-2xl font-bold text-red-600">{monthMetrics.noShowRate.toFixed(1)}%</p>
            <p className="text-xs text-neutral-400">este mes</p>
          </div>
        </div>
      )}

      {/* View Switcher + Date Navigator + Source Filter + Export */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ViewSwitcher currentView={view} onViewChange={setView} />

        {/* Date Navigator */}
        <div className="flex items-center gap-1" ref={rangePickerRef}>
          <button
            onClick={() => setDate((d) => subDays(d, navRange))}
            className="rounded-lg border border-neutral-200 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            title="Dia anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowRangePicker((v) => !v)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors min-w-[160px] text-center"
              title="Clique para configurar o intervalo"
            >
              {navRange === 1
                ? format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })
                : `${format(date, 'dd/MM', { locale: ptBR })} – ${format(addDays(date, navRange - 1), 'dd/MM', { locale: ptBR })}`
              }
              <span className="ml-1.5 text-xs text-neutral-400">
                {navRange > 1 ? `(${navRange}d)` : ''}
              </span>
            </button>

            {showRangePicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 rounded-xl border border-neutral-200 bg-white shadow-lg p-3 min-w-[260px]">

                {/* ── Mini Calendar ── */}
                <div className="mb-3">
                  {/* Header: prev / label / next */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => {
                        if (calPickerView === 'days') setCalPickerDate(subMonths(calPickerDate, 1))
                        else if (calPickerView === 'months') setCalPickerDate(subYears(calPickerDate, 1))
                        else setCalPickerDate(subYears(calPickerDate, 12))
                      }}
                      className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
                    ><ChevronLeft className="h-3.5 w-3.5" /></button>

                    {calPickerView === 'days' && (
                      <button
                        onClick={() => setCalPickerView('months')}
                        className="text-xs font-semibold text-neutral-800 hover:text-sky-600 transition-colors capitalize"
                      >
                        {format(calPickerDate, 'MMMM yyyy', { locale: ptBR })}
                      </button>
                    )}
                    {calPickerView === 'months' && (
                      <button
                        onClick={() => setCalPickerView('years')}
                        className="text-xs font-semibold text-neutral-800 hover:text-sky-600 transition-colors"
                      >
                        {format(calPickerDate, 'yyyy')}
                      </button>
                    )}
                    {calPickerView === 'years' && (
                      <span className="text-xs font-semibold text-neutral-800">
                        {calPickerDate.getFullYear() - 5} – {calPickerDate.getFullYear() + 6}
                      </span>
                    )}

                    <button
                      onClick={() => {
                        if (calPickerView === 'days') setCalPickerDate(addMonths(calPickerDate, 1))
                        else if (calPickerView === 'months') setCalPickerDate(addYears(calPickerDate, 1))
                        else setCalPickerDate(addYears(calPickerDate, 12))
                      }}
                      className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
                    ><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>

                  {/* Day grid */}
                  {calPickerView === 'days' && (() => {
                    const firstDay = startOfMonth(calPickerDate)
                    const totalDays = getDaysInMonth(calPickerDate)
                    // day-of-week offset (0=Sun→shift so Mon=0)
                    const offset = (getDay(firstDay) + 6) % 7
                    const cells: (number | null)[] = [
                      ...Array(offset).fill(null),
                      ...Array.from({ length: totalDays }, (_, i) => i + 1),
                    ]
                    const weekLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']
                    return (
                      <div>
                        <div className="grid grid-cols-7 mb-1">
                          {weekLabels.map(d => (
                            <span key={d} className="text-center text-[10px] font-medium text-neutral-400">{d}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-y-0.5">
                          {cells.map((day, i) => {
                            if (!day) return <span key={i} />
                            const cellDate = new Date(calPickerDate.getFullYear(), calPickerDate.getMonth(), day)
                            const isSelected = isSameDay(cellDate, date)
                            const isTodayCell = isToday(cellDate)
                            return (
                              <button
                                key={i}
                                onClick={() => { setDate(startOfDay(cellDate)); setShowRangePicker(false) }}
                                className={`text-[11px] h-6 w-6 mx-auto rounded-full transition-colors ${
                                  isSelected ? 'bg-sky-600 text-white font-bold' :
                                  isTodayCell ? 'border border-sky-400 text-sky-700 font-semibold hover:bg-sky-50' :
                                  'text-neutral-700 hover:bg-neutral-100'
                                }`}
                              >{day}</button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Month grid */}
                  {calPickerView === 'months' && (() => {
                    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
                    return (
                      <div className="grid grid-cols-4 gap-1">
                        {months.map((m, i) => {
                          const isActive = i === calPickerDate.getMonth()
                          return (
                            <button
                              key={m}
                              onClick={() => { setCalPickerDate(new Date(calPickerDate.getFullYear(), i, 1)); setCalPickerView('days') }}
                              className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                                isActive ? 'bg-sky-600 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                              }`}
                            >{m}</button>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Year grid */}
                  {calPickerView === 'years' && (() => {
                    const base = calPickerDate.getFullYear()
                    const years = Array.from({ length: 12 }, (_, i) => base - 5 + i)
                    return (
                      <div className="grid grid-cols-4 gap-1">
                        {years.map((y) => (
                          <button
                            key={y}
                            onClick={() => { setCalPickerDate(new Date(y, calPickerDate.getMonth(), 1)); setCalPickerView('months') }}
                            className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                              y === calPickerDate.getFullYear() ? 'bg-sky-600 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                            }`}
                          >{y}</button>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Range picker ── */}
                <div className="border-t border-neutral-100 pt-2">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">Intervalo de dias</p>
                  <div className="flex flex-col gap-1">
                    {[1, 3, 5, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => { setNavRange(n); setShowRangePicker(false) }}
                        className={`rounded-lg px-3 py-1.5 text-sm text-left transition-colors ${
                          navRange === n ? 'bg-sky-600 text-white font-medium' : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        {n === 1 ? '1 dia (padrão)' : `${n} dias`}
                      </button>
                    ))}
                    <div className="mt-1 border-t border-neutral-100 pt-2">
                      <p className="text-xs text-neutral-400 mb-1">Personalizado</p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={customDaysInput}
                          onChange={(e) => setCustomDaysInput(e.target.value)}
                          placeholder="Ex: 10"
                          className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                          onClick={() => {
                            const n = parseInt(customDaysInput, 10)
                            if (n > 0) { setNavRange(n); setShowRangePicker(false); setCustomDaysInput('') }
                          }}
                          className="rounded-lg bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 transition-colors"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setDate((d) => addDays(d, navRange))}
            className="rounded-lg border border-neutral-200 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            title="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
            {([
              { key: 'all' as const, label: 'Todos' },
              { key: 'bot' as const, label: '🤖 Bot' },
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
                  sourceFilter === option.key ? 'bg-sky-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:block text-sm text-neutral-500">
            {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}
          </div>
          <ExportMenu />
        </div>
      </div>

      {botAppointmentsCount > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-600 flex-shrink-0" />
          {botAppointmentsCount} agendamento{botAppointmentsCount !== 1 ? 's' : ''} criado{botAppointmentsCount !== 1 ? 's' : ''} pelo bot neste periodo.
        </div>
      )}

      {/* Calendar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
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

      {/* Today's appointments list — below calendar, collapsible */}
      {todayAppointments.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setTodayListCollapsed((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
          >
            <span className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-600" />
              Hoje — {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
              <span className="ml-1 rounded-full bg-sky-100 text-sky-700 text-xs px-2 py-0.5 font-medium">{todayAppointments.length}</span>
            </span>
            <span className={`text-xs text-neutral-400 transition-transform inline-block ${todayListCollapsed ? '' : 'rotate-180'}`}>▲</span>
          </button>
          {!todayListCollapsed && (
            <div className="divide-y divide-neutral-100">
              {todayAppointments.map((apt) => {
                const cfg = STATUS_CONFIG[apt.status]
                return (
                  <button
                    key={apt.id}
                    onClick={() => setSelectedAppointment(apt)}
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-neutral-50 transition-colors text-left group"
                  >
                    <div className="text-center w-12 flex-shrink-0">
                      <div className="text-sm font-bold text-neutral-900">{format(new Date(apt.starts_at), 'HH:mm')}</div>
                      <div className="text-xs text-neutral-400">{format(new Date(apt.ends_at), 'HH:mm')}</div>
                    </div>
                    <div className={`w-1 h-8 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-neutral-900 truncate group-hover:text-sky-700 transition-colors">
                        {isBotAppointment(apt) ? '🤖 ' : ''}{apt.patient_name}
                      </div>
                      {apt.description && (
                        <div className="text-xs text-neutral-400 truncate">{apt.description}</div>
                      )}
                    </div>
                    <span className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {appointments.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <Plus className="h-6 w-6 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Nenhum agendamento</h3>
          <p className="text-sm text-neutral-500 mb-6">Comece criando seu primeiro agendamento</p>
          <button
            onClick={() => { setCreateModalDate(new Date()); setShowCreateModal(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
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
          activeProvider={activeProvider}
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
