/**
 * POST /api/local/setup-zapi
 *
 * Insere ou atualiza a instância Z-API no banco SQLite local.
 * Disponível apenas quando LOCAL_DB=sqlite.
 *
 * Body: { instanceId: string, token: string, clientToken?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLocalClient } from '@/lib/db/local-client'
import { LOCAL_CLINIC_ID } from '@/lib/db/sqlite'

export async function POST(request: NextRequest) {
  if (process.env.LOCAL_DB !== 'sqlite') {
    return NextResponse.json({ error: 'Disponível apenas em modo LOCAL_DB=sqlite' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { instanceId, token, clientToken } = body as {
      instanceId?: string
      token?: string
      clientToken?: string
    }

    if (!instanceId || !token) {
      return NextResponse.json(
        { error: 'instanceId e token são obrigatórios' },
        { status: 400 },
      )
    }

    const db     = createLocalClient()
    const now    = new Date().toISOString()
    const clinicId = LOCAL_CLINIC_ID

    // Verifica se já existe uma instância para esta clínica
    const { data: existing } = await db
      .from('whatsapp_instances')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('provider', 'zapi')
      .maybeSingle()

    if (existing) {
      await db
        .from('whatsapp_instances')
        .update({
          instance_id:  instanceId,
          token:        token,
          client_token: clientToken ?? null,
          status:       'disconnected',
          updated_at:   now,
        })
        .eq('id', (existing as { id: string }).id)

      return NextResponse.json({ ok: true, action: 'updated' })
    }

    await db.from('whatsapp_instances').insert({
      clinic_id:    clinicId,
      instance_id:  instanceId,
      token:        token,
      client_token: clientToken ?? null,
      provider:     'zapi',
      status:       'disconnected',
      created_at:   now,
      updated_at:   now,
    })

    return NextResponse.json({ ok: true, action: 'created' })
  } catch (err) {
    console.error('[setup-zapi]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * GET /api/local/setup-zapi
 * Retorna a instância atual (se existir).
 */
export async function GET() {
  if (process.env.LOCAL_DB !== 'sqlite') {
    return NextResponse.json({ error: 'Disponível apenas em modo LOCAL_DB=sqlite' }, { status: 403 })
  }

  const db = createLocalClient()
  const { data } = await db
    .from('whatsapp_instances')
    .select('id, instance_id, token, client_token, status, provider')
    .eq('clinic_id', LOCAL_CLINIC_ID)
    .eq('provider', 'zapi')
    .maybeSingle()

  return NextResponse.json({ instance: data })
}
