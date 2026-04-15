import { NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/services/subscriptionService'
import { PlanFeature } from '@/lib/services/planFeatures'

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

  const hasCalendarIntegrationAccess = await checkFeatureAccess(
    session.clinic.id,
    PlanFeature.CALENDAR_INTEGRATION
  )

  if (!hasCalendarIntegrationAccess) {
    return NextResponse.json(
      {
        error:
          'Seu plano atual permite agenda manual e pelo chatbot, mas integrações externas exigem upgrade.',
      },
      { status: 403 }
    )
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
  const isDev = config.gestaods_is_dev ?? false
  const token = config.gestaods_api_token

  // O endpoint de listagem não tem versão dev — usa sempre /dados-agendamento/listagem/
  // isDev só diferencia criação/cancelamento de agendamento
  void isDev // suprime warning de unused
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  const pastDate = new Date(today); pastDate.setDate(today.getDate() - 7)
  const futureDate = new Date(today); futureDate.setDate(today.getDate() + 30)
  const endpoint = `${baseUrl}/dados-agendamento/listagem/${token}?data_inicial=${fmt(pastDate)}&data_final=${fmt(futureDate)}`

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
