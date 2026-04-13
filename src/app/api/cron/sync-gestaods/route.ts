/**
 * GestãoDS Bidirectional Synchronization Cron Job
 * Pulls appointments from GestãoDS and creates them locally.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncGestaoDSClinic } from '@/lib/services/gestaodsSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        // Basic security for cron invocations
        const authHeader = request.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createAdminClient()

        // 1. Fetch clinics with active GestãoDS integration (new model)
        const { data: configs, error: configError } = await supabase
            .from('clinic_integrations')
            .select('id, clinic_id, gestaods_api_token, gestaods_is_dev')
            .eq('provider', 'gestaods')
            .eq('is_connected', true)
            .not('gestaods_api_token', 'is', null)

        if (configError) throw configError
        if (!configs || configs.length === 0) {
            return NextResponse.json({ message: 'No active GestãoDS integrations found' })
        }

        const results = []

        for (const config of configs) {
            const clinicResults = {
                clinic_id: config.clinic_id,
                created: 0,
                updated: 0,
                skipped: 0,
                errors: [] as string[]
            }

            try {
                const summary = await syncGestaoDSClinic({
                    supabase,
                    config,
                    daysPast: 1,
                    daysFuture: 30,
                })

                clinicResults.created = summary.created
                clinicResults.updated = summary.updated
                clinicResults.skipped = summary.skipped
                clinicResults.errors = summary.errors
            } catch (err) {
                clinicResults.errors.push(`General error: ${String(err)}`)

                await supabase
                    .from('clinic_integrations')
                    .update({
                        sync_error: String(err),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', config.id)
            }

            results.push(clinicResults)
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('GestãoDS Cron Sync Error:', error)
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
