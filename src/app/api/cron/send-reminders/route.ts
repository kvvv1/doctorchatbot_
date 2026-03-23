/**
 * CRON Job - Send Pending Reminders
 * Run this every 5 minutes via Vercel Cron
 * Fetches pending reminders and sends via WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { zapiSendText } from '@/lib/zapi/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Validar CRON secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Buscar reminders pendentes usando a função do DB
    const { data: reminders, error } = await supabase
      .rpc('get_pending_reminders')
      .limit(50)

    if (error) {
      console.error('Error fetching reminders:', error)
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No pending reminders' })
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Processar cada lembrete
    for (const reminder of reminders) {
      try {
        // Buscar dados do appointment para preencher o template
        const { data: appointment } = await supabase
          .from('appointments')
          .select('*, conversation:conversations(patient_name)')
          .eq('id', reminder.appointment_id)
          .single()

        if (!appointment) {
          throw new Error('Appointment not found')
        }

        // Formatar mensagem substituindo variáveis
        const message = formatReminderMessage(
          reminder.message_template,
          {
            name: appointment.conversation?.patient_name || appointment.patient_name,
            date: format(new Date(appointment.starts_at), "dd 'de' MMMM", { locale: ptBR }),
            time: format(new Date(appointment.starts_at), 'HH:mm'),
            day: format(new Date(appointment.starts_at), "EEEE, dd 'de' MMMM", { locale: ptBR }),
          }
        )

        // Buscar credenciais da clínica para envio via Z-API
        const { data: clinic } = await supabase
          .from('clinics')
          .select('zapi_instance_id, zapi_token, zapi_client_token')
          .eq('id', reminder.clinic_id)
          .single()

        if (!clinic?.zapi_instance_id || !clinic?.zapi_token) {
          throw new Error('Z-API not configured for this clinic')
        }

        // Enviar via Z-API
        const zapiResponse = await zapiSendText(
          {
            instanceId: clinic.zapi_instance_id,
            token: clinic.zapi_token,
            clientToken: clinic.zapi_client_token || undefined,
          },
          reminder.recipient_phone,
          message
        )

        // Marcar como enviado
        await supabase
          .from('reminders')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            message_sent: message,
            zapi_message_id: zapiResponse.messageId || null,
          })
          .eq('id', reminder.id)

        results.sent++
      } catch (error) {
        console.error(`Error sending reminder ${reminder.id}:`, error)

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push(`Reminder ${reminder.id}: ${errorMessage}`)

        // Marcar como failed e incrementar retry_count
        await supabase
          .from('reminders')
          .update({
            status: 'failed',
            error_message: errorMessage,
            retry_count: reminder.retry_count + 1,
          })
          .eq('id', reminder.id)

        results.failed++
      }
    }

    return NextResponse.json({
      success: true,
      processed: reminders.length,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors,
    })
  } catch (error) {
    console.error('CRON job error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

/**
 * Formata mensagem substituindo variáveis no template
 */
function formatReminderMessage(
  template: string,
  variables: { name: string; date: string; time: string; day: string }
): string {
  return template
    .replace(/\{name\}/g, variables.name)
    .replace(/\{date\}/g, variables.date)
    .replace(/\{time\}/g, variables.time)
    .replace(/\{day\}/g, variables.day)
}
