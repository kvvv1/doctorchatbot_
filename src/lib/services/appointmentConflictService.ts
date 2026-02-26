import { createClient } from '@/lib/supabase/server'
import { isBefore, isAfter } from 'date-fns'

interface ConflictCheck {
  hasConflict: boolean
  conflictingAppointments?: Array<{
    id: string
    patient_name: string
    starts_at: string
    ends_at: string
  }>
}

/**
 * Verifica se há conflitos de horário para um agendamento
 */
export async function checkAppointmentConflicts(
  clinicId: string,
  startsAt: Date,
  endsAt: Date,
  professionalId?: string | null,
  resourceId?: string | null,
  excludeAppointmentId?: string
): Promise<ConflictCheck> {
  try {
    const supabase = await createClient()

    // Buscar appointments existentes que podem conflitar
    let query = supabase
      .from('appointments')
      .select('id, patient_name, starts_at, ends_at, professional_id, resource_id')
      .eq('clinic_id', clinicId)
      .in('status', ['scheduled', 'confirmed'])
      .not('starts_at', 'gte', endsAt.toISOString())
      .not('ends_at', 'lte', startsAt.toISOString())

    if (excludeAppointmentId) {
      query = query.neq('id', excludeAppointmentId)
    }

    const { data: appointments, error } = await query

    if (error) {
      console.error('Erro ao verificar conflitos:', error)
      return { hasConflict: false }
    }

    if (!appointments || appointments.length === 0) {
      return { hasConflict: false }
    }

    // Filtrar por profissional ou recurso se especificado
    const conflictingAppointments = appointments.filter((apt) => {
      // Se profissional especificado, verificar apenas appointments do mesmo profissional
      if (professionalId && apt.professional_id !== professionalId) {
        return false
      }

      // Se recurso especificado, verificar apenas appointments do mesmo recurso
      if (resourceId && apt.resource_id !== resourceId) {
        return false
      }

      // Verificar overlap de horários
      const aptStart = new Date(apt.starts_at)
      const aptEnd = new Date(apt.ends_at)

      return (
        (isBefore(startsAt, aptEnd) && isAfter(endsAt, aptStart)) ||
        startsAt.getTime() === aptStart.getTime() ||
        endsAt.getTime() === aptEnd.getTime()
      )
    })

    return {
      hasConflict: conflictingAppointments.length > 0,
      conflictingAppointments:
        conflictingAppointments.length > 0 ? conflictingAppointments : undefined,
    }
  } catch (error) {
    console.error('Erro ao verificar conflitos:', error)
    return { hasConflict: false }
  }
}

/**
 * Verifica se um horário está dentro do horário de funcionamento
 */
export async function checkWorkingHours(
  clinicId: string,
  date: Date,
  professionalId?: string | null
): Promise<boolean> {
  try {
    const supabase = await createClient()
    const dayOfWeek = date.getDay()
    const timeStr = date.toTimeString().split(' ')[0] // HH:MM:SS

    // Buscar working hours
    let query = supabase
      .from('working_hours')
      .select('start_time, end_time')
      .eq('clinic_id', clinicId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)

    if (professionalId) {
      query = query.or(`professional_id.is.null,professional_id.eq.${professionalId}`)
    } else {
      query = query.is('professional_id', null)
    }

    const { data: workingHours } = await query

    // Se não houver working hours configurado, assumir que está disponível
    if (!workingHours || workingHours.length === 0) {
      return true
    }

    // Verificar se o horário está dentro de algum período de trabalho
    return workingHours.some((hours) => {
      return timeStr >= hours.start_time && timeStr <= hours.end_time
    })
  } catch (error) {
    console.error('Erro ao verificar horário de funcionamento:', error)
    return true // Em caso de erro, permitir
  }
}

/**
 * Verifica se a data está em um período de folga
 */
export async function checkTimeOff(
  clinicId: string,
  date: Date,
  professionalId?: string | null
): Promise<boolean> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('time_off')
      .select('start_date, end_date')
      .eq('clinic_id', clinicId)
      .lte('start_date', date.toISOString())
      .gte('end_date', date.toISOString())

    if (professionalId) {
      query = query.or(`professional_id.is.null,professional_id.eq.${professionalId}`)
    } else {
      query = query.is('professional_id', null)
    }

    const { data: timeOffs } = await query

    return (timeOffs?.length ?? 0) > 0
  } catch (error) {
    console.error('Erro ao verificar folgas:', error)
    return false
  }
}
