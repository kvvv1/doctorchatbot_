'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, User, Phone, Calendar, Clock, FileText, MessageSquare, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react'
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
  onUpdate: (appointmentId: string, updates: { starts_at?: string; ends_at?: string; description?: string }) => Promise<void>
  onDelete: (appointmentId: string) => Promise<void>
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
  const [editDate, setEditDate] = useState(format(new Date(appointment.starts_at), 'yyyy-MM-dd'))
  const [editTime, setEditTime] = useState(format(new Date(appointment.starts_at), 'HH:mm'))
  const [editDescription, setEditDescription] = useState(appointment.description || '')

  const statusConfig = {
    scheduled: { label: 'Agendado', bg: 'bg-purple-100', text: 'text-purple-700' },
    confirmed: { label: 'Confirmado', bg: 'bg-green-100', text: 'text-green-700' },
    canceled: { label: 'Cancelado', bg: 'bg-red-100', text: 'text-red-700' },
    completed: { label: 'Concluído', bg: 'bg-blue-100', text: 'text-blue-700' },
    no_show: { label: 'Faltou', bg: 'bg-orange-100', text: 'text-orange-700' },
  }

  const config = statusConfig[appointment.status]
  const isBotAppointment =
    appointment.provider === 'manual' &&
    !!appointment.conversation_id &&
    (appointment.description || '').toLowerCase().includes('via whatsapp')

  const providerLabel = isBotAppointment
    ? 'Bot WhatsApp'
    : appointment.provider === 'google'
      ? 'Google Calendar'
      : 'Manual'

  const handleStatusChange = async (newStatus: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show') => {
    setIsProcessing(true)
    try {
      await onStatusChange(appointment.id, newStatus)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return

    setIsProcessing(true)
    try {
      await onDelete(appointment.id)
      onClose()
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editDate || !editTime) {
      alert('Informe data e horário válidos para editar o agendamento.')
      return
    }

    const startsAt = new Date(`${editDate}T${editTime}:00`)
    const originalStartsAt = new Date(appointment.starts_at)
    const originalEndsAt = new Date(appointment.ends_at)
    const durationMs = Math.max(originalEndsAt.getTime() - originalStartsAt.getTime(), 15 * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() + durationMs)

    setIsProcessing(true)
    try {
      await onUpdate(appointment.id, {
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        description: editDescription.trim() || undefined,
      })
      setIsEditing(false)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-neutral-900">Detalhes do Agendamento</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${config.bg} ${config.text}`}
            >
              {config.label}
            </span>
            <div className="text-sm text-neutral-500">
              ID: {appointment.id.slice(0, 8)}
            </div>
          </div>

          {/* Patient Info */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-100 p-2">
                <User className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-500">Paciente</div>
                <div className="text-lg font-semibold text-neutral-900">
                  {appointment.patient_name}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <Phone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-500">Telefone</div>
                <div className="text-lg font-semibold text-neutral-900">
                  {appointment.patient_phone}
                </div>
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div className="w-full">
                <div className="text-sm font-medium text-neutral-500">Data</div>
                {isEditing ? (
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="text-base font-semibold text-neutral-900">
                    {format(new Date(appointment.starts_at), "dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-100 p-2">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div className="w-full">
                <div className="text-sm font-medium text-neutral-500">Horário</div>
                {isEditing ? (
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="text-base font-semibold text-neutral-900">
                    {format(new Date(appointment.starts_at), 'HH:mm')} -{' '}
                    {format(new Date(appointment.ends_at), 'HH:mm')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {appointment.description && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-500 mb-1">Descrição</div>
                {isEditing ? (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="text-sm text-neutral-700 bg-neutral-50 rounded-lg p-3">
                    {appointment.description}
                  </div>
                )}
              </div>
            </div>
          )}

          {isEditing && !appointment.description && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-500 mb-1">Descrição</div>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {/* Conversation Link */}
          {appointment.conversation_id && (
            <div className="flex items-center gap-3 p-3 bg-sky-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-sky-600" />
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-700">
                  Agendamento vinculado a uma conversa
                </div>
              </div>
              <Link
                href={`/dashboard/conversas?id=${appointment.conversation_id}`}
                className="text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                Ver conversa →
              </Link>
            </div>
          )}

          {/* Provider Info */}
          <div className="text-xs text-neutral-500 border-t border-neutral-200 pt-4">
            Origem: {providerLabel}
            {appointment.provider_reference_id && ` • ID: ${appointment.provider_reference_id.slice(0, 12)}`}
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-neutral-50 border-t border-neutral-200 px-6 py-4">
          <div className="flex flex-wrap gap-3">
            {!isEditing && appointment.status !== 'canceled' && (
              <button
                onClick={() => setIsEditing(true)}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
              >
                <Edit className="h-4 w-4" />
                Editar
              </button>
            )}

            {isEditing && (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  Salvar edição
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditDate(format(new Date(appointment.starts_at), 'yyyy-MM-dd'))
                    setEditTime(format(new Date(appointment.starts_at), 'HH:mm'))
                    setEditDescription(appointment.description || '')
                  }}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancelar edição
                </button>
              </>
            )}

            {appointment.status === 'scheduled' && (
              <button
                onClick={() => handleStatusChange('confirmed')}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Confirmar
              </button>
            )}

            {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Concluir
              </button>
            )}

            {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
              <button
                onClick={() => handleStatusChange('no_show')}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Marcar Falta
              </button>
            )}

            {appointment.status !== 'canceled' && (
              <button
                onClick={handleDelete}
                disabled={isProcessing || isEditing}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors ml-auto"
              >
                <Trash2 className="h-4 w-4" />
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
