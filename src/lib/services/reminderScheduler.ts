/**
 * Reminder Helpers
 * Notas importantes:
 * - A criação automática de lembretes já é feita pelo banco via
 *   trigger `create_appointment_reminders` definida na migration 010.
 * - O cancelamento automático quando o status muda para canceled/completed
 *   também é feito pela trigger `cancel_appointment_reminders`.
 * - Aqui mantemos apenas um helper explícito para cancelar pendentes
 *   em casos especiais (ex.: marcar como no_show manualmente).
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Cancela todos os reminders pendentes de um appointment
 */
export async function cancelPendingReminders(appointmentId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reminders')
    .update({ status: 'canceled' })
    .eq('appointment_id', appointmentId)
    .eq('status', 'pending')
    .select()

  if (error) {
    console.error('Error cancelling reminders:', error)
    return { success: false, error: error.message }
  }

  return { success: true, cancelled: data.length }
}
