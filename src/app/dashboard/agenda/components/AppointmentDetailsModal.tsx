'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  X, User, Phone, Calendar, Clock, FileText, MessageSquare,
  Edit, Trash2, CheckCircle, XCircle, Loader2, AlertCircle,
} from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

interface AppointmentDetailsModalProps {
  appointment: {
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
  onClose: () => void
  onStatusChange: (appointmentId: string, newStatus: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show') => Promise<void>
  onUpdate: (appointmentId: string, updates: { starts_at?: string; ends_at?: string; description?: string; patient_name?: string; patient_phone?: string }) => Promise<void>
  onDelete: (appointmentId: string) => Promise<void>
}

/** Converte ISO UTC para "yyyy-MM-dd" no fuso do browser */
function isoToLocalDate(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd')
}

/** Converte ISO UTC para "HH:mm" no fuso do browser */
function isoToLocalTime(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}

/** Constroi ISO UTC a partir de data local (yyyy-MM-dd) + hora local (HH:mm) no browser */
function buildISOFromLocal(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

/** Duracao em minutos entre duas strings ISO */
function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.max(
    Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000),
    10,
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Calendar',
  gestaods: 'GestaoDS',
  manual: 'Manual',
}

const STATUS_CONFIG = {
  scheduled:  { label: 'Agendado',   bg: 'bg-purple-100', text: 'text-purple-700' },
  confirmed:  { label: 'Confirmado', bg: 'bg-green-100',  text: 'text-green-700'  },
  canceled:   { label: 'Cancelado',  bg: 'bg-red-100',    text: 'text-red-700'    },
  completed:  { label: 'Concluido',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
  no_show:    { label: 'Faltou',     bg: 'bg-orange-100', text: 'text-orange-700' },
}

export default function AppointmentDetailsModal({
  appointment,
  onClose,
  onStatusChange,
  onUpdate,
  onDelete,
}: AppointmentDetailsModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editPatientName, setEditPatientName] = useState(appointment.patient_name)
  const [editPatientPhone, setEditPatientPhone] = useState(appointment.patient_phone)
  const [editDate, setEditDate] = useState(isoToLocalDate(appointment.starts_at))
  const [editTime, setEditTime] = useState(isoToLocalTime(appointment.starts_at))
  const [editDuration, setEditDuration] = useState(
    durationMinutes(appointment.starts_at, appointment.ends_at),
  )
  const [editDescription, setEditDescription] = useState(appointment.description ?? '')

  const config = STATUS_CONFIG[appointment.status]

  const providerLabel = (() => {
    if (
      appointment.provider === 'manual' &&
      appointment.conversation_id &&
      appointment.description?.toLowerCase().includes('via whatsapp')
    ) return 'Bot WhatsApp'
    return PROVIDER_LABELS[appointment.provider] ?? appointment.provider
  })()

  const resetEdit = () => {
    setEditPatientName(appointment.patient_name)
    setEditPatientPhone(appointment.patient_phone)
    setEditDate(isoToLocalDate(appointment.starts_at))
    setEditTime(isoToLocalTime(appointment.starts_at))
    setEditDuration(durationMinutes(appointment.starts_at, appointment.ends_at))
    setEditDescription(appointment.description ?? '')
    setIsEditing(false)
    setError(null)
  }

  const handleStatusChange = async (
    newStatus: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show',
  ) => {
    setError(null)
    setIsProcessing(true)
    try {
      await onStatusChange(appointment.id, newStatus)
      setConfirmCancel(false)
    } catch {
      setError('Erro ao atualizar o status. Tente novamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async () => {
    setError(null)
    setIsProcessing(true)
    try {
      await onDelete(appointment.id)
      onClose()
    } catch {
      setError('Erro ao cancelar o agendamento. Tente novamente.')
      setConfirmCancel(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveEdit = async () => {
    setError(null)
    if (!editPatientName.trim()) { setError('O nome do paciente e obrigatorio.'); return }
    if (!editPatientPhone.replace(/\D/g, '')) { setError('O telefone do paciente e obrigatorio.'); return }
    if (!editDate || !editTime) { setError('Data e horario sao obrigatorios.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) { setError('Data invalida. Use o seletor de data.'); return }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { setError('Horario invalido. Use o formato HH:mm.'); return }

    const startsAt = buildISOFromLocal(editDate, editTime)
    if (isNaN(new Date(startsAt).getTime())) { setError('Data/hora invalida. Verifique os campos.'); return }

    const endsAt = new Date(new Date(startsAt).getTime() + editDuration * 60000).toISOString()

    setIsProcessing(true)
    try {
      await onUpdate(appointment.id, {
        patient_name: editPatientName.trim(),
        patient_phone: editPatientPhone.replace(/\D/g, ''),
        starts_at: startsAt,
        ends_at: endsAt,
        description: editDescription.trim() || undefined,
      })
      setIsEditing(false)
    } catch {
      setError('Erro ao salvar as alteracoes. Tente novamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-neutral-900">
            {isEditing ? 'Editar Agendamento' : 'Detalhes do Agendamento'}
          </h2>
          <button onClick={onClose} disabled={isProcessing} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 transition-colors disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status Badge */}
          {!isEditing && (
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${config.bg} ${config.text}`}>
                {config.label}
              </span>
              <div className="text-xs text-neutral-400 font-mono">ID: {appointment.id.slice(0, 8)}</div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* Patient Name */}
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-100 p-2 flex-shrink-0"><User className="h-5 w-5 text-sky-600" /></div>
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-500">Paciente</div>
              {isEditing ? (
                <input type="text" value={editPatientName} onChange={(e) => setEditPatientName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                  placeholder="Nome do paciente" />
              ) : (
                <div className="text-base font-semibold text-neutral-900">{appointment.patient_name}</div>
              )}
            </div>
          </div>

          {/* Patient Phone */}
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-green-100 p-2 flex-shrink-0"><Phone className="h-5 w-5 text-green-600" /></div>
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-500">Telefone</div>
              {isEditing ? (
                <input type="tel" value={editPatientPhone} onChange={(e) => setEditPatientPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                  placeholder="DDD + numero" />
              ) : (
                <div className="text-base font-semibold text-neutral-900">{appointment.patient_phone}</div>
              )}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-purple-100 p-2 flex-shrink-0"><Calendar className="h-5 w-5 text-purple-600" /></div>
              <div className="w-full">
                <div className="text-sm font-medium text-neutral-500">Data</div>
                {isEditing ? (
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400" />
                ) : (
                  <div className="text-base font-semibold text-neutral-900">
                    {format(new Date(appointment.starts_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-100 p-2 flex-shrink-0"><Clock className="h-5 w-5 text-orange-600" /></div>
              <div className="w-full">
                <div className="text-sm font-medium text-neutral-500">Horario</div>
                {isEditing ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)}
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400" />
                    <select value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} title="Duracao"
                      className="rounded-lg border border-neutral-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400">
                      {[10,15,20,30,40,45,60,90,120].map((m) => (
                        <option key={m} value={m}>{m}min</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="text-base font-semibold text-neutral-900">
                    {format(new Date(appointment.starts_at), 'HH:mm')}{' - '}{format(new Date(appointment.ends_at), 'HH:mm')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {(isEditing || appointment.description) && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2 flex-shrink-0"><FileText className="h-5 w-5 text-blue-600" /></div>
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-500 mb-1">Observacoes</div>
                {isEditing ? (
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3}
                    placeholder="Ex: Paciente alergico a dipirona"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 resize-none" />
                ) : (
                  <div className="text-sm text-neutral-700 bg-neutral-50 rounded-lg p-3">{appointment.description}</div>
                )}
              </div>
            </div>
          )}

          {/* Conversation link */}
          {appointment.conversation_id && (
            <div className="flex items-center gap-3 p-3 bg-sky-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-sky-600 flex-shrink-0" />
              <div className="flex-1 text-sm font-medium text-neutral-700">Vinculado a uma conversa</div>
              <Link href={`/dashboard/conversas?id=${appointment.conversation_id}`}
                className="text-sm font-medium text-sky-600 hover:text-sky-700 whitespace-nowrap">
                Ver conversa
              </Link>
            </div>
          )}

          {/* Provider Info */}
          <div className="text-xs text-neutral-400 border-t border-neutral-200 pt-3">
            Origem: {providerLabel}
            {appointment.provider_reference_id && (
              <> • ID externo: <span className="font-mono">{appointment.provider_reference_id.slice(0, 12)}</span></>
            )}
          </div>

          {/* Cancel confirmation inline */}
          {confirmCancel && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-medium text-red-800">
                Confirmar cancelamento do agendamento de <strong>{appointment.patient_name}</strong>?
              </p>
              <div className="flex gap-3">
                <button onClick={handleDelete} disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Sim, cancelar agendamento
                </button>
                <button onClick={() => setConfirmCancel(false)} disabled={isProcessing}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors">
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        {!confirmCancel && (
          <div className="sticky bottom-0 bg-neutral-50 border-t border-neutral-200 px-6 py-4">
            <div className="flex flex-wrap gap-3 items-center">
              {isEditing ? (
                <>
                  <button onClick={handleSaveEdit} disabled={isProcessing}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Salvar alteracoes
                  </button>
                  <button onClick={resetEdit} disabled={isProcessing}
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-colors">
                    <X className="h-4 w-4" />
                    Descartar
                  </button>
                </>
              ) : (
                <>
                  {appointment.status !== 'canceled' && (
                    <button onClick={() => { setIsEditing(true); setError(null) }} disabled={isProcessing}
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-colors">
                      <Edit className="h-4 w-4" />
                      Editar
                    </button>
                  )}
                  {appointment.status === 'scheduled' && (
                    <button onClick={() => handleStatusChange('confirmed')} disabled={isProcessing}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Confirmar
                    </button>
                  )}
                  {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                    <button onClick={() => handleStatusChange('completed')} disabled={isProcessing}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Concluir
                    </button>
                  )}
                  {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                    <button onClick={() => handleStatusChange('no_show')} disabled={isProcessing}
                      className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Marcar Falta
                    </button>
                  )}
                  {appointment.status !== 'canceled' && (
                    <button onClick={() => { setConfirmCancel(true); setError(null) }} disabled={isProcessing}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors ml-auto">
                      <Trash2 className="h-4 w-4" />
                      Cancelar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
