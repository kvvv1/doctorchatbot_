'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Clock, User, Phone, FileText, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { format, addMinutes } from 'date-fns'
import { maskPhone, unmask, maskDate, parseBrazilianDate, toBrazilianDate, maskTime24h } from '@/lib/utils/format'

interface CreateAppointmentModalProps {
  initialDate?: Date
  onClose: () => void
  onSuccess: () => void
  activeProvider?: 'gestaods' | 'google' | null
}

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export default function CreateAppointmentModal({
  initialDate = new Date(),
  onClose,
  onSuccess,
  activeProvider,
}: CreateAppointmentModalProps) {
  const [loading, setLoading] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)
  const timePickerRef = useRef<HTMLDivElement>(null)
  const timeIconRef = useRef<HTMLButtonElement>(null)
  const nativeDateInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    patient_name: '',
    patient_phone: '',
    cpf: '',
    date: toBrazilianDate(format(initialDate, 'yyyy-MM-dd')),
    time: format(initialDate, 'HH:mm'),
    duration: 30,
    description: '',
  })

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
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSyncWarning(null)

    // Validate time
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.time)) {
      setError('Horário inválido. Use o formato HH:mm (ex: 14:30).')
      return
    }

    const isoDate = parseBrazilianDate(formData.date)
    if (!isoDate) {
      setError('Data inválida. Use o formato DD/MM/AAAA.')
      return
    }

    if (activeProvider === 'gestaods' && !formData.cpf.replace(/\D/g, '')) {
      setError('O CPF do paciente é obrigatório para sincronizar com o GestaoDS.')
      return
    }

    if (formData.cpf) {
      const digits = formData.cpf.replace(/\D/g, '')
      if (digits.length !== 11) {
        setError('CPF inválido. Informe todos os 11 dígitos.')
        return
      }
    }

    setLoading(true)
    try {
      const startsAt = new Date(`${isoDate}T${formData.time}:00`)
      const endsAt = addMinutes(startsAt, formData.duration)

      const response = await fetch('/api/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: formData.patient_name,
          patientPhone: unmask(formData.patient_phone),
          cpf: formData.cpf ? formData.cpf.replace(/\D/g, '') : undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          description: formData.description || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          setError('Já existe um agendamento neste horário. Escolha outro horário.')
        } else if (response.status === 400 && data.error === 'Fora do horário de funcionamento') {
          setError('Este horário está fora do horário de funcionamento da clínica.')
        } else if (response.status === 400 && data.error === 'Data indisponível') {
          setError('Esta data está marcada como folga.')
        } else {
          setError(data.error || 'Erro ao criar agendamento. Tente novamente.')
        }
        return
      }

      // Warn about external sync failure (appointment was still created)
      if (!data.eventCreated && data.eventError && activeProvider) {
        setSyncWarning(`Agendamento criado localmente, mas não foi possível sincronizar com ${activeProvider === 'gestaods' ? 'GestaoDS' : 'Google Calendar'}: ${data.eventError}`)
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 3000)
        return
      }

      onSuccess()
      onClose()
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-neutral-900">Novo Agendamento</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* Sync warning (success + warning) */}
          {syncWarning && (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{syncWarning}</span>
            </div>
          )}

          {/* GestaoDS CPF notice */}
          {activeProvider === 'gestaods' && (
            <div className="flex items-start gap-2 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Integração GestaoDS ativa. O CPF do paciente é necessário para sincronizar o agendamento.</span>
            </div>
          )}

          {/* Patient Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
              <User className="h-4 w-4" />
              Nome do Paciente *
            </label>
            <input
              type="text"
              required
              value={formData.patient_name}
              onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              placeholder="Nome do paciente"
            />
          </div>

          {/* Patient Phone */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
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

          {/* CPF — always shown; required when GestaoDS */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
              CPF {activeProvider === 'gestaods' ? <span className="text-red-500">*</span> : <span className="text-neutral-400 text-xs font-normal">(opcional)</span>}
            </label>
            <input
              type="text"
              required={activeProvider === 'gestaods'}
              value={formData.cpf}
              onChange={(e) => setFormData({ ...formData, cpf: maskCpf(e.target.value) })}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
                <Calendar className="h-4 w-4" />
                Data *
              </label>
              <div className="relative">
                <input
                  ref={nativeDateInputRef}
                  type="date"
                  value={parseBrazilianDate(formData.date) || format(initialDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    if (e.target.value) setFormData({ ...formData, date: toBrazilianDate(e.target.value) })
                  }}
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => { setShowTimePicker(false); nativeDateInputRef.current?.showPicker?.() }}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 hover:text-sky-600 cursor-pointer z-10 transition-colors"
                >
                  <Calendar className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  required
                  placeholder="DD/MM/AAAA"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: maskDate(e.target.value) })}
                  className="w-full rounded-lg border border-neutral-300 pl-11 pr-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
                <Clock className="h-4 w-4" />
                Horário *
              </label>
              <div className="relative">
                <button
                  type="button"
                  ref={timeIconRef}
                  onClick={() => setShowTimePicker(!showTimePicker)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 hover:text-sky-600 cursor-pointer z-10 transition-colors"
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
                  <div ref={timePickerRef} className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg border border-neutral-200 shadow-lg p-3 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-neutral-900 mb-1 text-center">Hora</label>
                        <select
                          value={formData.time.split(':')[0] || '00'}
                          onChange={(e) => {
                            const h = e.target.value.padStart(2, '0')
                            const m = formData.time.split(':')[1] || '00'
                            setFormData({ ...formData, time: `${h}:${m}` })
                          }}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm text-neutral-900 text-center focus:border-sky-500 focus:outline-none"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
                          ))}
                        </select>
                      </div>
                      <span className="text-lg font-semibold text-neutral-400 mt-5">:</span>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-neutral-900 mb-1 text-center">Minuto</label>
                        <select
                          value={formData.time.split(':')[1] || '00'}
                          onChange={(e) => {
                            const h = formData.time.split(':')[0] || '00'
                            const m = e.target.value.padStart(2, '0')
                            setFormData({ ...formData, time: `${h}:${m}` })
                          }}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm text-neutral-900 text-center focus:border-sky-500 focus:outline-none"
                        >
                          {Array.from({ length: 60 }, (_, i) => (
                            <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowTimePicker(false)} className="mt-3 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors">
                      Confirmar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
              <Clock className="h-4 w-4" />
              Duração
            </label>
            <select
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value={10}>10 minutos</option>
              <option value={15}>15 minutos</option>
              <option value={20}>20 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora e 30 minutos</option>
              <option value={120}>2 horas</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-900 mb-1.5">
              <FileText className="h-4 w-4" />
              Observações (opcional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 resize-none"
              placeholder="Informe observações sobre o agendamento..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <><CheckCircle className="h-4 w-4" /> Criar Agendamento</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
