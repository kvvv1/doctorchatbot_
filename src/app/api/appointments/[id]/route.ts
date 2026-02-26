import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/calendar/googleCalendar'
import { cancelPendingReminders } from '@/lib/services/reminderScheduler'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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

    const { data: appointment, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (error || !appointment) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ appointment })
  } catch (error) {
    console.error('Erro ao buscar agendamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
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

    // Buscar appointment atual
    const { data: currentAppointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (!currentAppointment) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
    }

    // Atualizar no banco
    const { data: appointment, error } = await supabase
      .from('appointments')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('clinic_id', profile.clinic_id)
      .select()
      .single()

    if (error) {
      console.error('Erro ao atualizar agendamento:', error)
      return NextResponse.json({ error: 'Erro ao atualizar agendamento' }, { status: 500 })
    }

    // Atualizar no Google Calendar se conectado
    if (
      currentAppointment.provider === 'google' &&
      currentAppointment.provider_reference_id
    ) {
      try {
        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('clinic_id', profile.clinic_id)
          .eq('is_connected', true)
          .single()

        if (integration) {
          await updateCalendarEvent({
            accessToken: integration.google_access_token!,
            refreshToken: integration.google_refresh_token!,
            calendarId: integration.google_calendar_id || 'primary',
            eventId: currentAppointment.provider_reference_id,
            title: `Consulta - ${appointment.patient_name}`,
            description: appointment.description,
            startsAt: new Date(appointment.starts_at),
            endsAt: new Date(appointment.ends_at),
            patientPhone: appointment.patient_phone,
          })
        }
      } catch (calendarError) {
        console.error('Erro ao atualizar no Google Calendar:', calendarError)
        // Não falhar a requisição se apenas o Google Calendar falhar
      }
    }

    // Cancelar reminders se o status mudou para canceled ou completed
    if (
      body.status &&
      (body.status === 'canceled' || body.status === 'completed' || body.status === 'no_show') &&
      currentAppointment.status !== body.status
    ) {
      try {
        await cancelPendingReminders(appointment.id)
      } catch (error) {
        console.error('Erro ao cancelar reminders:', error)
        // Continue mesmo se falhar
      }
    }

    return NextResponse.json({ appointment })
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Buscar appointment
    const { data: appointment } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (!appointment) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
    }

    // Soft delete: marcar como cancelado
    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('clinic_id', profile.clinic_id)

    if (error) {
      console.error('Erro ao cancelar agendamento:', error)
      return NextResponse.json({ error: 'Erro ao cancelar agendamento' }, { status: 500 })
    }

    // Cancelar reminders pendentes
    try {
      await cancelPendingReminders(id)
    } catch (error) {
      console.error('Erro ao cancelar reminders:', error)
      // Continue mesmo se falhar
    }

    // Deletar do Google Calendar se conectado
    if (appointment.provider === 'google' && appointment.provider_reference_id) {
      try {
        const { data: integration } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('clinic_id', profile.clinic_id)
          .eq('is_connected', true)
          .single()

        if (integration) {
          await deleteCalendarEvent(
            integration.google_access_token!,
            integration.google_refresh_token!,
            integration.google_calendar_id || 'primary',
            appointment.provider_reference_id
          )
        }
      } catch (calendarError) {
        console.error('Erro ao deletar do Google Calendar:', calendarError)
        // Não falhar a requisição se apenas o Google Calendar falhar
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar agendamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
