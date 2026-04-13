import { NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/gestaods/debug
 * Chama a API GestaoDS diretamente e retorna o resultado cru para diagnóstico.
 * Remova este endpoint após resolver o problema.
 */
export async function GET() {
  const session = await getSessionProfile()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: config } = await supabase
    .from('clinic_integrations')
    .select('gestaods_api_token, gestaods_is_dev, is_connected')
    .eq('clinic_id', session.clinic.id)
    .eq('provider', 'gestaods')
    .maybeSingle()

  if (!config) {
    return NextResponse.json({ error: 'Integração não encontrada no banco' })
  }

  if (!config.gestaods_api_token) {
    return NextResponse.json({ error: 'Token não configurado' })
  }

  const baseUrl = 'https://apidev.gestaods.com.br/api'
  const isDev = config.gestaods_is_dev ?? true
  const token = config.gestaods_api_token

  const endpoint = isDev
    ? `${baseUrl}/dev-dados-agendamento/${token}/`
    : `${baseUrl}/dados-agendamento/listagem/${token}?data_inicial=2026-01-01&data_final=2026-12-31`

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    const rawText = await response.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(rawText) } catch { /* not json */ }

    return NextResponse.json({
      endpoint,
      isDev,
      is_connected: config.is_connected,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      rawText: rawText.slice(0, 2000), // trunca para não explodir
      parsed: parsed ?? '(não é JSON válido)',
      recordCount: Array.isArray(parsed) ? parsed.length : null,
      firstRecord: Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null,
    })
  } catch (err) {
    return NextResponse.json({
      endpoint,
      error: String(err),
    })
  }
}
