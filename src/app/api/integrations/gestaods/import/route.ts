import { NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncGestaoDSClinic } from '@/lib/services/gestaodsSync'
import { checkFeatureAccess } from '@/lib/services/subscriptionService'
import { PlanFeature } from '@/lib/services/planFeatures'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
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
    const { data: config, error } = await supabase
      .from('clinic_integrations')
      .select('id, clinic_id, gestaods_api_token, gestaods_is_dev, is_connected')
      .eq('clinic_id', session.clinic.id)
      .eq('provider', 'gestaods')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!config || !config.is_connected || !config.gestaods_api_token) {
      return NextResponse.json(
        { error: 'Integração GestãoDS não está ativa para esta clínica.' },
        { status: 400 }
      )
    }

    const summary = await syncGestaoDSClinic({
      supabase,
      config,
      daysPast: 180,
      daysFuture: 365,
    })

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
