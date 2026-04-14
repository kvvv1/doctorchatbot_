import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type GestaoDSBody = {
  enabled?: boolean
  isDev?: boolean
  apiToken?: string
}

export async function GET() {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('clinic_integrations')
      .select('is_connected, gestaods_is_dev, gestaods_api_token, updated_at, last_sync_at, sync_error')
      .eq('clinic_id', session.clinic.id)
      .eq('provider', 'gestaods')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      enabled: data?.is_connected ?? false,
      isDev: data?.gestaods_is_dev ?? false,
      hasToken: !!data?.gestaods_api_token,
      updatedAt: data?.updated_at ?? null,
      lastSyncAt: data?.last_sync_at ?? null,
      syncError: data?.sync_error ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as GestaoDSBody
    const enabled = !!body.enabled
    const isDev = body.isDev ?? false
    const inputToken = body.apiToken?.trim() || null

    const supabase = createAdminClient()
    const { data: existing, error: fetchError } = await supabase
      .from('clinic_integrations')
      .select('id, gestaods_api_token')
      .eq('clinic_id', session.clinic.id)
      .eq('provider', 'gestaods')
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const tokenToPersist = inputToken || existing?.gestaods_api_token || null
    if (enabled && !tokenToPersist) {
      return NextResponse.json(
        { error: 'Informe o token da API GestãoDS para ativar a integração.' },
        { status: 400 }
      )
    }

    const payload = {
      clinic_id: session.clinic.id,
      provider: 'gestaods',
      is_connected: enabled,
      gestaods_api_token: tokenToPersist,
      gestaods_is_dev: isDev,
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('clinic_integrations')
        .update(payload)
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      const { error: insertError } = await supabase
        .from('clinic_integrations')
        .insert(payload)

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      enabled,
      isDev,
      hasToken: !!tokenToPersist,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('clinic_integrations')
      .update({
        is_connected: false,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', session.clinic.id)
      .eq('provider', 'gestaods')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}