import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSessionProfile()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('appointment_settings')
      .select('default_duration_minutes')
      .eq('clinic_id', session.clinic.id)
      .maybeSingle()

    if (error) {
      console.error('[AppointmentSettings GET]', error)
      return NextResponse.json({ error: 'Erro ao carregar configurações' }, { status: 500 })
    }

    return NextResponse.json({
      defaultDurationMinutes: data?.default_duration_minutes ?? 30,
    })
  } catch (err) {
    console.error('[AppointmentSettings GET] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionProfile()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { defaultDurationMinutes } = body as { defaultDurationMinutes?: unknown }

    const parsed = Number(defaultDurationMinutes)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 480) {
      return NextResponse.json(
        { error: 'Duração deve ser entre 1 e 480 minutos' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('appointment_settings')
      .upsert(
        {
          clinic_id: session.clinic.id,
          default_duration_minutes: parsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id' },
      )

    if (error) {
      console.error('[AppointmentSettings PATCH]', error)
      return NextResponse.json(
        { error: 'Falha ao salvar duração da consulta' },
        { status: 500 },
      )
    }

    return NextResponse.json({ defaultDurationMinutes: parsed })
  } catch (err) {
    console.error('[AppointmentSettings PATCH] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
