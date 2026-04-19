'use client'

import { useState } from 'react'
import { UserPlus, Trash2, RefreshCw, Clock, Phone, User, ClipboardList } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface WaitlistEntry {
  id: string
  patient_name: string | null
  patient_phone: string
  waitlist_preferred_time_start: string | null
  waitlist_preferred_time_end: string | null
  waitlist_appointment_type: string | null
  waitlist_expires_at: string | null
  updated_at: string
}

interface WaitlistPageClientProps {
  initialEntries: WaitlistEntry[]
}

const TIME_PERIOD_LABELS: Record<string, string> = {
  '08-12': '🌅 Manhã (8h–12h)',
  '12-18': '☀️ Tarde (12h–18h)',
  '18-21': '🌙 Noite (18h–21h)',
  '00-23': '🕐 Qualquer horário',
}

function getTimePeriodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return '🕐 Qualquer horário'
  const key = `${start}-${end}`
  return TIME_PERIOD_LABELS[key] ?? `${start}h–${end}h`
}

const TIME_OPTIONS = [
  { label: '🌅 Manhã (8h–12h)', start: '08', end: '12' },
  { label: '☀️ Tarde (12h–18h)', start: '12', end: '18' },
  { label: '🌙 Noite (18h–21h)', start: '18', end: '21' },
  { label: '🕐 Qualquer horário', start: '00', end: '23' },
]

export default function WaitlistPageClient({ initialEntries }: WaitlistPageClientProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>(initialEntries)
  const [isLoading, setIsLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Add form state
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    timeStart: '00',
    timeEnd: '23',
    appointmentType: '' as '' | 'particular' | 'convenio',
  })
  const [isAdding, setIsAdding] = useState(false)

  const showNotification = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const refresh = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/waitlist')
      const json = await res.json()
      setEntries(json.data ?? [])
    } catch {
      showNotification('Erro ao atualizar lista', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async (id: string) => {
    setRemovingId(id)
    try {
      const res = await fetch(`/api/waitlist/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setEntries((prev) => prev.filter((e) => e.id !== id))
      showNotification('Paciente removido da lista de espera', 'success')
    } catch {
      showNotification('Erro ao remover paciente', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patientName.trim() || !form.patientPhone.trim()) return

    setIsAdding(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: form.patientName,
          patientPhone: form.patientPhone,
          timeStart: form.timeStart,
          timeEnd: form.timeEnd,
          appointmentType: form.appointmentType || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao adicionar')
      }
      showNotification('Paciente adicionado à lista de espera!', 'success')
      setForm({ patientName: '', patientPhone: '', timeStart: '00', timeEnd: '23', appointmentType: '' })
      setShowAddForm(false)
      await refresh()
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Erro ao adicionar paciente', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-sky-600" />
            Lista de Espera
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Pacientes aguardando um horário disponível na agenda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Adicionar paciente
          </button>
        </div>
      </div>

      {/* Add form modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">Adicionar à lista de espera</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Nome do paciente *</label>
                <input
                  type="text"
                  required
                  value={form.patientName}
                  onChange={(e) => setForm({ ...form, patientName: e.target.value })}
                  placeholder="Ex: João Silva"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Telefone (WhatsApp) *</label>
                <input
                  type="text"
                  required
                  value={form.patientPhone}
                  onChange={(e) => setForm({ ...form, patientPhone: e.target.value })}
                  placeholder="Ex: 11999998888"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Preferência de horário</label>
                <select
                  value={`${form.timeStart}-${form.timeEnd}`}
                  onChange={(e) => {
                    const opt = TIME_OPTIONS.find((o) => `${o.start}-${o.end}` === e.target.value)
                    if (opt) setForm({ ...form, timeStart: opt.start, timeEnd: opt.end })
                  }}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                >
                  {TIME_OPTIONS.map((o) => (
                    <option key={`${o.start}-${o.end}`} value={`${o.start}-${o.end}`}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Tipo de consulta</label>
                <select
                  value={form.appointmentType}
                  onChange={(e) => setForm({ ...form, appointmentType: e.target.value as '' | 'particular' | 'convenio' })}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                >
                  <option value="">Qualquer</option>
                  <option value="particular">Particular</option>
                  <option value="convenio">Convênio</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
                >
                  {isAdding ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Total na fila</p>
          <p className="mt-1 text-3xl font-bold text-neutral-900">{entries.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Com preferência de horário</p>
          <p className="mt-1 text-3xl font-bold text-sky-600">
            {entries.filter((e) => e.waitlist_preferred_time_start && e.waitlist_preferred_time_start !== '00').length}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Aguardando mais antigo</p>
          <p className="mt-1 text-sm font-semibold text-neutral-700">
            {entries.length > 0
              ? formatDistanceToNow(new Date(entries[0].updated_at), { locale: ptBR, addSuffix: true })
              : '—'}
          </p>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-neutral-500 font-medium">Nenhum paciente na lista de espera</p>
          <p className="mt-1 text-sm text-neutral-400">
            Pacientes entram na lista quando solicitam horário pelo WhatsApp ou ao adicionar manualmente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 hover:border-sky-200 transition-colors"
            >
              {/* Position */}
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                {index + 1}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 font-medium text-neutral-900 text-sm">
                    <User className="h-3.5 w-3.5 text-neutral-400" />
                    {entry.patient_name || 'Paciente'}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-neutral-500">
                    <Phone className="h-3 w-3" />
                    {entry.patient_phone}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {getTimePeriodLabel(entry.waitlist_preferred_time_start, entry.waitlist_preferred_time_end)}
                  </span>
                  {entry.waitlist_appointment_type && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 capitalize">
                      {entry.waitlist_appointment_type === 'particular' ? 'Particular' : 'Convênio'}
                    </span>
                  )}
                  <span className="text-neutral-400">
                    Na fila {formatDistanceToNow(new Date(entry.updated_at), { locale: ptBR, addSuffix: true })}
                  </span>
                  {entry.waitlist_expires_at && (
                    <span className="text-neutral-400">
                      · expira {format(new Date(entry.waitlist_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`/dashboard/conversas?phone=${entry.patient_phone}`}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  Ver conversa
                </a>
                <button
                  onClick={() => handleRemove(entry.id)}
                  disabled={removingId === entry.id}
                  title="Remover da lista de espera"
                  className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {removingId === entry.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
