import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

type WorkingHoursDay = {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  enabled: boolean
  start: string
  end: string
}

type WorkingHoursPayload = {
  timezone: string
  days: WorkingHoursDay[]
}

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      clinicId,
      clinicName,
      defaultDurationMinutes,
      workingHoursEnabled,
      workingHours,
    } = body as {
      clinicId?: string
      clinicName?: string
      defaultDurationMinutes?: number
      workingHoursEnabled?: boolean
      workingHours?: WorkingHoursPayload
    }

    if (!clinicId || session.clinic.id !== clinicId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const trimmedClinicName = (clinicName || '').trim()
    if (!trimmedClinicName) {
      return NextResponse.json({ error: 'Nome da clínica é obrigatório' }, { status: 400 })
    }

    const parsedDuration = Number(defaultDurationMinutes)
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return NextResponse.json(
        { error: 'Duração padrão deve ser um número positivo' },
        { status: 400 }
      )
    }

    if (!workingHours || !Array.isArray(workingHours.days) || workingHours.days.length !== 7) {
      return NextResponse.json(
        { error: 'Horário de funcionamento inválido' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { error: clinicError } = await supabase
      .from('clinics')
      .update({
        name: trimmedClinicName,
        updated_at: now,
      })
      .eq('id', clinicId)

    if (clinicError) {
      console.error('[GeneralSettings] Failed to update clinic:', clinicError)
      return NextResponse.json({ error: 'Falha ao atualizar nome da clínica' }, { status: 500 })
    }

    const { error: appointmentSettingsError } = await supabase
      .from('appointment_settings')
      .upsert(
        {
          clinic_id: clinicId,
          default_duration_minutes: parsedDuration,
          updated_at: now,
        },
        { onConflict: 'clinic_id' }
      )

    if (appointmentSettingsError) {
      console.error('[GeneralSettings] Failed to update appointment settings:', appointmentSettingsError)
      return NextResponse.json(
        { error: 'Falha ao atualizar duração padrão de consulta' },
        { status: 500 }
      )
    }

    const { error: botSettingsError } = await supabase
      .from('bot_settings')
      .upsert(
        {
          clinic_id: clinicId,
          working_hours_enabled: !!workingHoursEnabled,
          working_hours: workingHours,
          updated_at: now,
        },
        { onConflict: 'clinic_id' }
      )

    if (botSettingsError) {
      console.error('[GeneralSettings] Failed to update bot settings:', botSettingsError)
      return NextResponse.json(
        { error: 'Falha ao atualizar horário de funcionamento' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      clinicName: trimmedClinicName,
      defaultDurationMinutes: parsedDuration,
    })
  } catch (error) {
    console.error('[GeneralSettings] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
