import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelPendingReminders } from '@/lib/services/reminderScheduler'
import { cancelExternalAppointment, updateExternalAppointment } from '@/lib/integrations/integrationRouter'
import { normalizeAppointmentOrigin } from '@/lib/appointments/source'

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

    return NextResponse.json({ appointment: normalizeAppointmentOrigin(appointment) })
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

    // Atualizar integração externa (Google/GestãoDS) quando necessário
    if (currentAppointment.provider_reference_id) {
      const externalUpdate = await updateExternalAppointment({
        supabase,
        clinicId: profile.clinic_id,
        provider: currentAppointment.provider,
        providerReferenceId: currentAppointment.provider_reference_id,
        patientName: appointment.patient_name,
        patientPhone: appointment.patient_phone,
        startsAt: new Date(appointment.starts_at),
        endsAt: new Date(appointment.ends_at),
        description: appointment.description,
      })

      if (externalUpdate.error) {
        console.error('Erro ao atualizar integração externa:', externalUpdate.error)
      } else if (
        externalUpdate.providerReferenceId &&
        externalUpdate.providerReferenceId !== currentAppointment.provider_reference_id
      ) {
        const { error: providerRefError } = await supabase
          .from('appointments')
          .update({ provider_reference_id: externalUpdate.providerReferenceId })
          .eq('id', id)

        if (providerRefError) {
          console.error('Erro ao atualizar provider_reference_id após remarcação externa:', providerRefError)
        } else {
          appointment.provider_reference_id = externalUpdate.providerReferenceId
        }
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

    return NextResponse.json({ appointment: normalizeAppointmentOrigin(appointment) })
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

    // Cancelar integração externa (Google/GestãoDS) quando aplicável
    if (appointment.provider_reference_id) {
      const externalCancel = await cancelExternalAppointment({
        supabase,
        clinicId: profile.clinic_id,
        provider: appointment.provider,
        providerReferenceId: appointment.provider_reference_id,
      })

      if (externalCancel.error) {
        console.error('Erro ao cancelar integração externa:', externalCancel.error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao deletar agendamento:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
