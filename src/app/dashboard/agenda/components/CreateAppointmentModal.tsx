'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Clock, User, Phone, FileText, Loader2 } from 'lucide-react'
import { format, addMinutes } from 'date-fns'
import { maskPhone, unmask, maskDate, parseBrazilianDate, toBrazilianDate, maskTime24h } from '@/lib/utils/format'

interface CreateAppointmentModalProps {
  initialDate?: Date
  onClose: () => void
  onSuccess: () => void
}

export default function CreateAppointmentModal({
  initialDate = new Date(),
  onClose,
  onSuccess,
}: CreateAppointmentModalProps) {
  const [loading, setLoading] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const timePickerRef = useRef<HTMLDivElement>(null)
  const timeIconRef = useRef<HTMLButtonElement>(null)
  const nativeDateInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    patient_name: '',
    patient_phone: '',
    date: toBrazilianDate(format(initialDate, 'yyyy-MM-dd')),
    time: format(initialDate, 'HH:mm'),
    duration: 30,
    description: '',
  })

  // Fechar time picker ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        timePickerRef.current &&
        !timePickerRef.current.contains(event.target as Node) &&
        timeIconRef.current &&
        !timeIconRef.current.contains(event.target as Node)
      ) {
        setShowTimePicker(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validar formato de hora (HH:mm)
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.time)) {
        alert('Por favor, insira um horário válido no formato HH:mm (ex: 14:30)')
        setLoading(false)
        return
      }

      // Combinar data e hora
      const isoDate = parseBrazilianDate(formData.date)
      const startsAt = new Date(`${isoDate}T${formData.time}:00`)
      const endsAt = addMinutes(startsAt, formData.duration)

      const response = await fetch('/api/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: formData.patient_name,
          patientPhone: unmask(formData.patient_phone),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          description: formData.description || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Erro ao criar agendamento')
        return
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Erro ao criar agendamento:', error)
      alert('Erro ao criar agendamento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-900">Novo Agendamento</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Patient Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
              <User className="h-4 w-4" />
              Nome do Paciente *
            </label>
            <input
              type="text"
              required
              value={formData.patient_name}
              onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              placeholder="Digite o nome do paciente"
            />
          </div>

          {/* Patient Phone */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
              <Phone className="h-4 w-4" />
              Telefone *
            </label>
            <input
              type="tel"
              required
              value={formData.patient_phone}
              onChange={(e) => setFormData({ ...formData, patient_phone: maskPhone(e.target.value) })}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              placeholder="(00) 00000-0000"
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
                <Calendar className="h-4 w-4" />
                Data *
              </label>
              <div className="relative">
                <input
                  ref={nativeDateInputRef}
                  type="date"
                  value={parseBrazilianDate(formData.date) || format(initialDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    if (e.target.value) {
                      setFormData({ ...formData, date: toBrazilianDate(e.target.value) })
                    }
                  }}
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowTimePicker(false)
                    nativeDateInputRef.current?.showPicker?.()
                  }}
                  className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400 hover:text-sky-600 cursor-pointer z-10 transition-colors"
                >
                  <Calendar className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  required
                  placeholder="DD/MM/YYYY"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: maskDate(e.target.value) })}
                  className="w-full rounded-lg border border-neutral-300 pl-11 pr-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
                <Clock className="h-4 w-4" />
                Horário *
              </label>
              <div className="relative">
                <button
                  type="button"
                  ref={timeIconRef}
                  onClick={() => {
                    setShowTimePicker(!showTimePicker)
                  }}
                  className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400 hover:text-sky-600 cursor-pointer z-10 transition-colors"
                >
                  <Clock className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  required
                  placeholder="HH:mm"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: maskTime24h(e.target.value) })}
                  className="w-full rounded-lg border border-neutral-300 pl-11 pr-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                {showTimePicker && (
                  <div
                    ref={timePickerRef}
                    className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg border border-neutral-200 shadow-lg p-3 min-w-[200px]"
                  >
                    <div className="flex items-center gap-2">
                      {/* Horas */}
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-neutral-600 mb-1 text-center">Hora</label>
                        <select
                          value={formData.time.split(':')[0] || '00'}
                          onChange={(e) => {
                            const hours = e.target.value.padStart(2, '0')
                            const minutes = formData.time.split(':')[1] || '00'
                            setFormData({ ...formData, time: `${hours}:${minutes}` })
                          }}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-center"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i.toString().padStart(2, '0')}>
                              {i.toString().padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <span className="text-lg font-semibold text-neutral-400 mt-6">:</span>
                      
                      {/* Minutos */}
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-neutral-600 mb-1 text-center">Minuto</label>
                        <select
                          value={formData.time.split(':')[1] || '00'}
                          onChange={(e) => {
                            const hours = formData.time.split(':')[0] || '00'
                            const minutes = e.target.value.padStart(2, '0')
                            setFormData({ ...formData, time: `${hours}:${minutes}` })
                          }}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-center"
                        >
                          {Array.from({ length: 60 }, (_, i) => (
                            <option key={i} value={i.toString().padStart(2, '0')}>
                              {i.toString().padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTimePicker(false)}
                      className="mt-3 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
                    >
                      Confirmar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
              <Clock className="h-4 w-4" />
              Duração
            </label>
            <select
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora e 30 minutos</option>
              <option value={120}>2 horas</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-2">
              <FileText className="h-4 w-4" />
              Descrição (opcional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 resize-none"
              placeholder="Adicione observações sobre o agendamento..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Criando...' : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
