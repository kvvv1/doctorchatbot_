/**
 * Bot Appointment Service
 * Handles appointment creation/modification from bot interactions
 */

import { createClient } from '@/lib/supabase/server'
import { parse, addDays, setHours, setMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface CreateAppointmentFromBotParams {
  conversationId: string
  clinicId: string
  patientName: string
  patientPhone: string
  dayText: string // e.g., "amanhã", "segunda", "15/02"
  timeText: string // e.g., "14:30", "2h da tarde"
}

interface AppointmentResult {
  success: boolean
  appointmentId?: string
  message: string
  error?: string
}

/**
 * Cria um agendamento a partir da interação do bot
 */
export async function createAppointmentFromBot(
  params: CreateAppointmentFromBotParams
): Promise<AppointmentResult> {
  try {
    // Parse day
    const appointmentDate = parseDayText(params.dayText)
    if (!appointmentDate) {
      return {
        success: false,
        message: 'Não consegui entender a data. Pode repetir? (Ex: "amanhã", "segunda-feira", "15/02")',
        error: 'Invalid day format',
      }
    }

    // Parse time
    const appointmentTime = parseTimeText(params.timeText)
    if (!appointmentTime) {
      return {
        success: false,
        message: 'Não consegui entender o horário. Pode repetir? (Ex: "14:30", "2h da tarde")',
        error: 'Invalid time format',
      }
    }

    // Combine date and time
    const startsAt = setHours(
      setMinutes(appointmentDate, appointmentTime.minutes),
      appointmentTime.hours
    )
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000) // 30 min default

    // Create appointment via API (internal fetch)
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/appointments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: params.conversationId,
        patientName: params.patientName,
        patientPhone: params.patientPhone,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        description: 'Agendamento via WhatsApp Bot',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Conflito de horário
      if (response.status === 409) {
        return {
          success: false,
          message: '⚠️ Este horário já está ocupado. Temos disponível:\n\n' +
                   '1️⃣ Amanhã às 10h\n' +
                   '2️⃣ Amanhã às 14h\n' +
                   '3️⃣ Depois de amanhã às 9h\n\n' +
                   'Digite o número da opção desejada ou sugira outro horário.',
          error: 'Conflict',
        }
      }

      return {
        success: false,
        message: 'Desculpe, não consegui confirmar o agendamento. Pode tentar novamente ou falar com nossa equipe?',
        error: data.error || 'Unknown error',
      }
    }

    return {
      success: true,
      appointmentId: data.appointment.id,
      message: '✅ Perfeito! Seu agendamento está confirmado:\n\n' +
               `📅 Data: ${startsAt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}\n` +
               `⏰ Horário: ${startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n\n` +
               'Você receberá um lembrete 24h antes. Para cancelar ou reagendar, basta me enviar uma mensagem.',
    }
  } catch (error) {
    console.error('Error creating appointment from bot:', error)
    return {
      success: false,
      message: 'Ops! Tive um problema técnico. Pode tentar novamente em instantes?',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Parse day text to Date
 * Suporta: amanhã, hoje, segunda, terça, 15/02, 15-02
 */
function parseDayText(dayText: string): Date | null {
  const text = dayText.toLowerCase().trim()
  const now = new Date()

  // Hoje
  if (/hoje/i.test(text)) {
    return now
  }

  // Amanhã
  if (/amanh[ãa]/i.test(text)) {
    return addDays(now, 1)
  }

  // Depois de amanhã
  if (/depois.*amanh|daqui.*2.*dia/i.test(text)) {
    return addDays(now, 2)
  }

  // Dias da semana
  const weekdays = [
    'domingo',
    'segunda',
    'terça',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sábado',
    'sabado',
  ]

  for (let i = 0; i < weekdays.length; i++) {
    if (text.includes(weekdays[i])) {
      const targetDay = i
      const currentDay = now.getDay()
      let daysToAdd = targetDay - currentDay

      if (daysToAdd <= 0) {
        daysToAdd += 7 // Next week
      }

      return addDays(now, daysToAdd)
    }
  }

  // Formato DD/MM ou DD-MM
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})/)
  if (dateMatch) {
    const day = parseInt(dateMatch[1])
    const month = parseInt(dateMatch[2]) - 1 // 0-indexed
    const year = now.getFullYear()

    const date = new Date(year, month, day)
    if (date < now) {
      date.setFullYear(year + 1) // Next year
    }

    return date
  }

  return null
}

/**
 * Parse time text to { hours, minutes }
 * Suporta: 14:30, 14h30, 2h da tarde, 9h, 15:00
 */
function parseTimeText(timeText: string): { hours: number; minutes: number } | null {
  const text = timeText.toLowerCase().trim()

  // Formato HH:MM
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/)
  if (timeMatch) {
    return {
      hours: parseInt(timeMatch[1]),
      minutes: parseInt(timeMatch[2]),
    }
  }

  // Formato HHh ou HHhMM
  const hourMatch = text.match(/(\d{1,2})h(\d{2})?/)
  if (hourMatch) {
    return {
      hours: parseInt(hourMatch[1]),
      minutes: hourMatch[2] ? parseInt(hourMatch[2]) : 0,
    }
  }

  // Formato "2 da tarde", "10 da manhã"
  const periodMatch = text.match(/(\d{1,2}).*(?:da )?(manh[ãa]|tarde|noite)/i)
  if (periodMatch) {
    let hours = parseInt(periodMatch[1])
    const period = periodMatch[2]

    if (period.includes('tarde') && hours < 12) {
      hours += 12
    } else if (period.includes('noite') && hours < 12) {
      hours += 12
    }

    return { hours, minutes: 0 }
  }

  // Apenas número (assume formato 24h)
  const numberMatch = text.match(/^(\d{1,2})$/)
  if (numberMatch) {
    return {
      hours: parseInt(numberMatch[1]),
      minutes: 0,
    }
  }

  return null
}

/**
 * Busca appointment por conversation_id
 */
export async function findAppointmentByConversation(
  conversationId: string
): Promise<{ id: string; starts_at: string; status: string } | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('appointments')
      .select('id, starts_at, status')
      .eq('conversation_id', conversationId)
      .in('status', ['scheduled', 'confirmed'])
      .order('starts_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    return data
  } catch (error) {
    console.error('Error finding appointment:', error)
    return null
  }
}

/**
 * Cancela um agendamento
 */
export async function cancelAppointmentFromBot(
  appointmentId: string
): Promise<AppointmentResult> {
  try {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/appointments/${appointmentId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      return {
        success: false,
        message: 'Não consegui cancelar o agendamento. Pode tentar novamente?',
      }
    }

    return {
      success: true,
      appointmentId,
      message: '✅ Agendamento cancelado com sucesso!\n\nSe quiser agendar novamente, é só me avisar.',
    }
  } catch (error) {
    console.error('Error canceling appointment:', error)
    return {
      success: false,
      message: 'Tive um problema ao cancelar. Pode falar com nossa equipe?',
    }
  }
}
