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

    // Strip unknown columns that may not exist yet in the DB to avoid update errors.
    // menu_order requires migration 028; particular_days requires migration 029; convenios requires migration 030.
    // message_takeover and takeover_message_enabled require migration 033.
    // convenio_solicita_carteirinha requires migration 034.
    // Strip columns added in migrations 026+ so the fallback can still save core settings
    // when those migrations haven't been applied yet.
    const { menu_options, menu_order, particular_days, convenios, message_takeover, takeover_message_enabled, convenio_solicita_carteirinha, convenios_solicita_carteirinha, waitlist_notifications_enabled, bot_handles_reschedule, bot_handles_cancel, bot_handles_particular, bot_handles_exam, bot_handles_exam_particular, ...settingsWithoutNewCols } = settings ?? {}
    let settingsPayload = { ...settings, updated_at: now }

    const { data: updatedSettings, error: settingsError } = await supabase
      .from('bot_settings')
      .update(settingsPayload)
      .eq('clinic_id', clinicId)
      .select()
      .single()

    if (settingsError) {
      // If the error is about a missing column, retry without the new columns
      if (
        settingsError.message?.includes('menu_order') ||
        settingsError.message?.includes('particular_days') ||
        settingsError.message?.includes('convenios') ||
        settingsError.message?.includes('message_takeover') ||
        settingsError.message?.includes('takeover_message_enabled') ||
        settingsError.message?.includes('menu_options') ||
        settingsError.message?.includes('convenio_solicita_carteirinha') ||
        settingsError.message?.includes('convenios_solicita_carteirinha') ||
        settingsError.message?.includes('waitlist_notifications_enabled') ||
        settingsError.message?.includes('bot_handles_reschedule') ||
        settingsError.message?.includes('bot_handles_cancel') ||
        settingsError.message?.includes('bot_handles_particular') ||
        settingsError.message?.includes('bot_handles_exam') ||
        settingsError.message?.includes('bot_handles_exam_particular') ||
        settingsError.code === '42703'
      ) {
        console.warn('[BotConfig] New column missing — retrying without new columns')
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('bot_settings')
          .update({ ...settingsWithoutNewCols, updated_at: now })
          .eq('clinic_id', clinicId)
          .select()
          .single()
        if (fallbackError || !fallbackData) {
          console.error('[BotConfig] Failed to update bot_settings (fallback):', fallbackError)
          return NextResponse.json({ error: 'Falha ao salvar configurações do bot', detail: fallbackError?.message, code: fallbackError?.code }, { status: 500 })
        }
        settingsPayload = fallbackData
      } else {
        console.error('[BotConfig] Failed to update bot_settings:', settingsError)
        return NextResponse.json({ error: 'Falha ao salvar configurações do bot', detail: settingsError?.message, code: settingsError?.code }, { status: 500 })
      }
    }

    const finalSettings = updatedSettings ?? settingsPayload

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
      settings: finalSettings,
      defaultDurationMinutes,
    })
  } catch (error) {
    console.error('[BotConfig] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
