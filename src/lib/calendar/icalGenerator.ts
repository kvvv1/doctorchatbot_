/**
 * iCal Feed Generator
 * Generates .ics files for calendar feeds and appointments export
 */

import ical, { ICalCalendar, ICalEventStatus } from 'ical-generator'
import { createClient } from '@/lib/supabase/server'

export interface AppointmentForExport {
  id: string
  patient_name: string
  patient_phone: string
  starts_at: string
  ends_at: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'canceled' | 'no_show'
  description?: string
}

/**
 * Gera feed iCal para todos os appointments de uma clínica
 * Pode ser usado para criar calendário subscrito (iCal feed)
 */
export async function generateICalFeed(clinicId: string): Promise<string> {
  const supabase = await createClient()

  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', clinicId)
    .single()

  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, patient_name, patient_phone, starts_at, ends_at, status, description')
    .eq('clinic_id', clinicId)
    .neq('status', 'canceled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  const calendar = ical({
    name: clinic?.name || 'Agenda Clínica',
    description: 'Agenda de consultas e atendimentos',
    timezone: 'America/Sao_Paulo',
    ttl: 3600, // Cache por 1 hora
  })

  if (appointments && appointments.length > 0) {
    for (const apt of appointments) {
      const status: ICalEventStatus = getICalStatus(apt.status)

      calendar.createEvent({
        id: apt.id,
        start: new Date(apt.starts_at),
        end: new Date(apt.ends_at),
        summary: `Consulta - ${apt.patient_name}`,
        description: apt.description
          ? `${apt.description}\n\nPaciente: ${apt.patient_name}\nTelefone: ${apt.patient_phone}`
          : `Paciente: ${apt.patient_name}\nTelefone: ${apt.patient_phone}`,
        location: clinic?.name || 'Clínica',
        status: status,
        busystatus: 'BUSY',
        url: `${process.env.APP_URL || 'http://localhost:3000'}/dashboard/agenda`,
      })
    }
  }

  return calendar.toString()
}

/**
 * Gera arquivo .ics para um único appointment
 * Usado para enviar por email ou WhatsApp
 */
export function generateAppointmentICS(appointment: AppointmentForExport): string {
  const calendar = ical({
    name: 'Consulta Médica',
    timezone: 'America/Sao_Paulo',
  })

  const status: ICalEventStatus = getICalStatus(appointment.status)

  calendar.createEvent({
    id: appointment.id,
    start: new Date(appointment.starts_at),
    end: new Date(appointment.ends_at),
    summary: `Consulta - ${appointment.patient_name}`,
    description: appointment.description
      ? `${appointment.description}\n\nPaciente: ${appointment.patient_name}\nTelefone: ${appointment.patient_phone}`
      : `Paciente: ${appointment.patient_name}\nTelefone: ${appointment.patient_phone}`,
    location: 'Clínica',
    status: status,
    busystatus: 'BUSY',
    url: `${process.env.APP_URL || 'http://localhost:3000'}/dashboard/agenda`,
  })

  return calendar.toString()
}

/**
 * Gera CSV para export de appointments
 */
export async function generateAppointmentsCSV(
  clinicId: string,
  startDate?: Date,
  endDate?: Date
): Promise<string> {
  const supabase = await createClient()

  let query = supabase
    .from('appointments')
    .select('patient_name, patient_phone, starts_at, ends_at, status, description')
    .eq('clinic_id', clinicId)
    .order('starts_at', { ascending: true })

  if (startDate) {
    query = query.gte('starts_at', startDate.toISOString())
  }

  if (endDate) {
    query = query.lte('starts_at', endDate.toISOString())
  }

  const { data: appointments } = await query

  if (!appointments || appointments.length === 0) {
    return 'Nome,Telefone,Data,Hora Início,Hora Fim,Status,Descrição\n'
  }

  // CSV Header
  const headers = ['Nome', 'Telefone', 'Data', 'Hora Início', 'Hora Fim', 'Status', 'Descrição']
  let csv = headers.join(',') + '\n'

  // CSV Rows
  for (const apt of appointments) {
    const startsAt = new Date(apt.starts_at)
    const endsAt = new Date(apt.ends_at)

    const row = [
      escapeCSV(apt.patient_name),
      escapeCSV(apt.patient_phone),
      startsAt.toLocaleDateString('pt-BR'),
      startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      endsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      getStatusLabel(apt.status),
      escapeCSV(apt.description || ''),
    ]

    csv += row.join(',') + '\n'
  }

  return csv
}

/**
 * Mapeia status do app para status iCal
 */
function getICalStatus(status: string): ICalEventStatus {
  switch (status) {
    case 'confirmed':
      return 'CONFIRMED'
    case 'completed':
      return 'CONFIRMED'
    case 'canceled':
      return 'CANCELLED'
    case 'no_show':
      return 'CANCELLED'
    default:
      return 'TENTATIVE'
  }
}

/**
 * Mapeia status para label em português
 */
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    canceled: 'Cancelado',
    no_show: 'Falta',
  }
  return labels[status] || status
}

/**
 * Escapa valores CSV para evitar problemas com vírgulas e aspas
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
