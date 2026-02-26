import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addMinutes, format, isBefore, isAfter, startOfDay, endOfDay, getDay } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) {
      return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })
    }

    // Parâmetros
    const searchParams = request.nextUrl.searchParams
    const dateStr = searchParams.get('date') // YYYY-MM-DD
    const duration = parseInt(searchParams.get('duration') || '30')
    const professionalId = searchParams.get('professional_id')

    if (!dateStr) {
      return NextResponse.json({ error: 'Data é obrigatória' }, { status: 400 })
    }

    const targetDate = new Date(dateStr)
    const dayOfWeek = getDay(targetDate)

    // Buscar configurações da clínica
    const { data: settings } = await supabase
      .from('appointment_settings')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .single()

    const businessStart = settings?.business_start_time || '08:00:00'
    const businessEnd = settings?.business_end_time || '18:00:00'
    const bufferTime = settings?.buffer_time_minutes || 0

    // Buscar working hours
    let workingHoursQuery = supabase
      .from('working_hours')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)

    if (professionalId) {
      workingHoursQuery = workingHoursQuery.or(
        `professional_id.is.null,professional_id.eq.${professionalId}`
      )
    }

    const { data: workingHours } = await workingHoursQuery

    // Se não houver working hours específico, usar horário padrão
    const availableHours =
      workingHours && workingHours.length > 0
        ? workingHours
        : [
            {
              start_time: businessStart,
              end_time: businessEnd,
            },
          ]

    // Buscar appointments existentes no dia
    let appointmentsQuery = supabase
      .from('appointments')
      .select('starts_at, ends_at')
      .eq('clinic_id', profile.clinic_id)
      .gte('starts_at', startOfDay(targetDate).toISOString())
      .lte('starts_at', endOfDay(targetDate).toISOString())
      .in('status', ['scheduled', 'confirmed'])

    if (professionalId) {
      appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId)
    }

    const { data: existingAppointments } = await appointmentsQuery

    // Buscar folgas
    let timeOffQuery = supabase
      .from('time_off')
      .select('start_date, end_date')
      .eq('clinic_id', profile.clinic_id)
      .lte('start_date', endOfDay(targetDate).toISOString())
      .gte('end_date', startOfDay(targetDate).toISOString())

    if (professionalId) {
      timeOffQuery = timeOffQuery.or(`professional_id.is.null,professional_id.eq.${professionalId}`)
    }

    const { data: timeOffs } = await timeOffQuery

    // Se houver folga no dia, retornar vazio
    if (timeOffs && timeOffs.length > 0) {
      return NextResponse.json({ availableSlots: [] })
    }

    // Gerar slots disponíveis
    const availableSlots: string[] = []

    for (const hours of availableHours) {
      const startParts = hours.start_time.split(':')
      const endParts = hours.end_time.split(':')

      let currentTime = new Date(targetDate)
      currentTime.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0, 0)

      const endTime = new Date(targetDate)
      endTime.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0)

      while (isBefore(currentTime, endTime)) {
        const slotEnd = addMinutes(currentTime, duration)

        // Verificar se slot está dentro do horário de trabalho
        if (isAfter(slotEnd, endTime)) {
          break
        }

        // Verificar conflitos com appointments existentes
        const hasConflict = existingAppointments?.some((apt) => {
          const aptStart = new Date(apt.starts_at)
          const aptEnd = new Date(apt.ends_at)

          // Com buffer time
          const aptStartWithBuffer = addMinutes(aptStart, -bufferTime)
          const aptEndWithBuffer = addMinutes(aptEnd, bufferTime)

          return (
            (isBefore(currentTime, aptEndWithBuffer) && isAfter(slotEnd, aptStartWithBuffer)) ||
            (currentTime.getTime() === aptStart.getTime() && slotEnd.getTime() === aptEnd.getTime())
          )
        })

        if (!hasConflict) {
          availableSlots.push(format(currentTime, 'HH:mm'))
        }

        // Próximo slot (a cada 15 minutos)
        currentTime = addMinutes(currentTime, 15)
      }
    }

    return NextResponse.json({ availableSlots })
  } catch (error) {
    console.error('Erro ao calcular disponibilidade:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
