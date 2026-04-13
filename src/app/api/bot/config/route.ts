import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clinicId, settings, defaultDurationMinutes } = await request.json()

    if (!clinicId || clinicId !== session.clinic.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // defaultDurationMinutes is optional — only validated when provided
    if (defaultDurationMinutes !== undefined && defaultDurationMinutes !== null) {
      if (!Number.isFinite(defaultDurationMinutes) || defaultDurationMinutes <= 0) {
        return NextResponse.json(
          { error: 'Duração padrão da consulta inválida' },
          { status: 400 }
        )
      }
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: updatedSettings, error: settingsError } = await supabase
      .from('bot_settings')
      .update({
        ...settings,
        updated_at: now,
      })
      .eq('clinic_id', clinicId)
      .select()
      .single()

    if (settingsError || !updatedSettings) {
      console.error('[BotConfig] Failed to update bot_settings:', settingsError)
      return NextResponse.json({ error: 'Falha ao salvar configurações do bot' }, { status: 500 })
    }

    // Only update appointment duration when explicitly provided
    if (Number.isFinite(defaultDurationMinutes) && defaultDurationMinutes > 0) {
      const { error: appointmentSettingsError } = await supabase
        .from('appointment_settings')
        .upsert(
          {
            clinic_id: clinicId,
            default_duration_minutes: defaultDurationMinutes,
            updated_at: now,
          },
          { onConflict: 'clinic_id' }
        )

      if (appointmentSettingsError) {
        console.error('[BotConfig] Failed to update appointment_settings:', appointmentSettingsError)
        return NextResponse.json({ error: 'Falha ao salvar duração padrão de consulta' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
      defaultDurationMinutes,
    })
  } catch (error) {
    console.error('[BotConfig] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
