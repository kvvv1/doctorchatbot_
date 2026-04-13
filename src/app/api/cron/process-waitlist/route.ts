import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAvailableSlots } from '@/lib/bot/availability'
import { getWaitlistConversations } from '@/lib/bot/actions'
import { getBotSettings } from '@/lib/services/botSettingsService'
import { zapiSendText } from '@/lib/zapi/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

        const slots = await getAvailableSlots(clinicId, new Date(), botSettings, 1)
        if (slots.length === 0) continue

        const waitlistConversations = await getWaitlistConversations(clinicId)
        if (!waitlistConversations.length) continue

        const target = waitlistConversations[0]

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

        const bestSlot = slots[0]
        const patientName = target.patient_name || 'Paciente'

        const message = `Oi, ${patientName}! Surgiu uma vaga na agenda: ${bestSlot.label}.\n\nSe quiser, responda com *Agendar* para eu te ajudar a marcar.`

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
