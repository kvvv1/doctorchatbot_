/**
 * GestãoDS Bidirectional Synchronization Cron Job
 * Pulls appointments from GestãoDS and creates them locally.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GestaoDSService } from '@/lib/services/gestaods'
import { format, subDays, addDays } from 'date-fns'

export async function GET(request: NextRequest) {
    try {
        // Basic security: check for secret if needed, or just run (Supabase Cron calls this)
        const authHeader = request.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = await createClient()

        // 1. Fetch all clinics with GestãoDS enabled
        const { data: configs, error: configError } = await supabase
            .from('gestaods_settings')
            .select('clinic_id, api_token')
            .eq('is_enabled', true)

        if (configError) throw configError
        if (!configs || configs.length === 0) {
            return NextResponse.json({ message: 'No active GestãoDS integrations found' })
        }

        const results = []

        for (const config of configs) {
            const clinicResults = {
                clinic_id: config.clinic_id,
                synced: 0,
                errors: [] as string[]
            }

            try {
                const gestaoService = new GestaoDSService(config.api_token)

                // Sync window: yesterday to 30 days from now
                const startDate = format(subDays(new Date(), 1), 'yyyy-MM-dd')
                const endDate = format(addDays(new Date(), 30), 'yyyy-MM-dd')

                const gestaoAppointments = await gestaoService.listAppointments(startDate, endDate)

                if (!gestaoAppointments.success || !gestaoAppointments.data) {
                    clinicResults.errors.push(`Failed to list appointments: ${gestaoAppointments.error}`)
                    results.push(clinicResults)
                    continue
                }

                for (const gApp of gestaoAppointments.data) {
                    // gApp structure based on documentation/OpenAPI relatorio agendamentos
                    // Note: Structure might vary depending on the endpoint used. 
                    // Using the properties from relatorio_agendamentos mapping
                    const gId = String(gApp.id || gApp.token)
                    const gPatientCpf = gApp.paciente_cpf || gApp.cpf
                    const gStartsAt = gApp.data_hora_inicio || gApp.starts_at || gApp.data_agendamento
                    const gEndsAt = gApp.data_hora_fim || gApp.ends_at || gApp.data_fim_agendamento
                    const gStatus = gApp.status_nome || gApp.status || 'scheduled'

                    // 1. Check if appointment exists
                    const { data: existing } = await supabase
                        .from('appointments')
                        .select('id')
                        .eq('gestaods_id', gId)
                        .maybeSingle()

                    if (existing) continue // Already synced

                    // 2. We need patient info (name/phone). If not in gApp, we might need a separate call.
                    // For now, if missing, we'll try to find the patient locally by CPF or fetch from GestãoDS.
                    let patientName = gApp.paciente_nome || 'Paciente GestãoDS'
                    let patientPhone = gApp.paciente_celular || ''

                    if (!patientPhone && gPatientCpf) {
                        // Optional: Fetch patient details from GestãoDS to get the phone
                        const pData = await gestaoService.getPatient(gPatientCpf)
                        if (pData.success && pData.data) {
                            patientName = pData.data.nome
                            patientPhone = pData.data.celular || ''
                        }
                    }

                    // 3. Create local appointment
                    const { error: insertError } = await supabase
                        .from('appointments')
                        .insert({
                            clinic_id: config.clinic_id,
                            patient_name: patientName,
                            patient_phone: patientPhone || '00000000000',
                            starts_at: new Date(gStartsAt).toISOString(),
                            ends_at: new Date(gEndsAt).toISOString(),
                            status: mapStatus(gStatus),
                            provider: 'gestaods',
                            gestaods_id: gId
                        })

                    if (insertError) {
                        clinicResults.errors.push(`Error inserting app ${gId}: ${insertError.message}`)
                    } else {
                        clinicResults.synced++
                    }
                }
            } catch (err) {
                clinicResults.errors.push(`General error: ${String(err)}`)
            }

            results.push(clinicResults)
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error('GestãoDS Cron Sync Error:', error)
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}

function mapStatus(gestaoStatus: string): string {
    const s = gestaoStatus.toLowerCase()
    if (s.includes('confirm')) return 'confirmed'
    if (s.includes('canc')) return 'canceled'
    if (s.includes('falt') || s.includes('show')) return 'no_show'
    return 'scheduled'
}
