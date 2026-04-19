import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAvailableSlots } from '@/lib/bot/availability'
import { getWaitlistConversations } from '@/lib/bot/actions'
import { getBotSettings } from '@/lib/services/botSettingsService'
import { zapiSendText } from '@/lib/zapi/client'
import { templates } from '@/lib/bot/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Filter available slots based on the patient's preferred time window.
 * timeStart / timeEnd are hour strings like "08", "12".
 * If both are null (legacy entries without preference), all slots pass.
 */
function filterSlotsByPreference(
  slots: { startsAt: string; label: string }[],
  timeStart: string | null,
  timeEnd: string | null,
): typeof slots {
  if (!timeStart || !timeEnd) return slots
  const start = parseInt(timeStart, 10)
  const end   = parseInt(timeEnd, 10)
  return slots.filter((s) => {
    const hour = new Date(s.startsAt).getHours()
    return hour >= start && hour < end
  })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: waitlistRows, error: waitlistError } = await supabase
      .from('conversations')
      .select('clinic_id')
      .eq('status', 'waitlist')

    if (waitlistError) {
      console.error('[WaitlistCron] Failed to fetch waitlist conversations:', waitlistError)
      return NextResponse.json({ error: 'Failed to fetch waitlist conversations' }, { status: 500 })
    }

    const clinicIds = Array.from(new Set((waitlistRows || []).map((row) => row.clinic_id))).filter(Boolean)

    if (clinicIds.length === 0) {
      return NextResponse.json({ success: true, processedClinics: 0, notified: 0, message: 'No waitlist entries' })
    }

    let notified = 0
    const errors: string[] = []

    for (const clinicId of clinicIds) {
      try {
        const botSettings = await getBotSettings(clinicId)
        if (!botSettings) continue

        // Fetch all available slots for the next days
        const allSlots = await getAvailableSlots(clinicId, new Date(), botSettings, 1)
        if (allSlots.length === 0) continue

        const waitlistConversations = await getWaitlistConversations(clinicId)
        if (!waitlistConversations.length) continue

        const { data: instance, error: instanceError } = await supabase
          .from('whatsapp_instances')
          .select('instance_id, token, client_token, status')
          .eq('clinic_id', clinicId)
          .eq('provider', 'zapi')
          .single()

        if (instanceError || !instance?.instance_id || !instance?.token || instance.status !== 'connected') {
          errors.push(`Clinic ${clinicId}: WhatsApp instance unavailable`)
          continue
        }

        for (const target of waitlistConversations) {
          try {
            // Apply preference filter — if patient specified a time window, honour it
            const matchingSlots = filterSlotsByPreference(
              allSlots,
              target.waitlist_preferred_time_start ?? null,
              target.waitlist_preferred_time_end ?? null,
            )

            if (matchingSlots.length === 0) {
              // No slots in the patient's preferred window — skip for now
              continue
            }

            const bestSlot = matchingSlots[0]
            const patientName = target.patient_name || 'Paciente'

            const message = templates.waitlistNotification(patientName, bestSlot.label)

            await zapiSendText(
              {
                instanceId: instance.instance_id,
                token: instance.token,
                clientToken: instance.client_token || undefined,
              },
              target.patient_phone,
              message
            )

            await supabase
              .from('conversations')
              .update({
                status: 'waiting_patient',
                updated_at: new Date().toISOString(),
              })
              .eq('id', target.id)

            await supabase.from('notifications').insert({
              clinic_id: clinicId,
              type: 'conversation_waiting',
              title: 'Paciente notificado da lista de espera',
              message: `${patientName} foi avisado(a) sobre uma vaga disponível na agenda.`,
              link: `/dashboard/conversas?id=${target.id}`,
              conversation_id: target.id,
            })

            notified++
          } catch (patientError) {
            errors.push(`Clinic ${clinicId} / conversation ${target.id}: ${patientError instanceof Error ? patientError.message : 'Unknown error'}`)
          }
        }
      } catch (error) {
        errors.push(`Clinic ${clinicId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      processedClinics: clinicIds.length,
      notified,
      errors,
    })
  } catch (error) {
    console.error('[WaitlistCron] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
