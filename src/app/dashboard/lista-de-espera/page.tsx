import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'
import WaitlistPageClient from './WaitlistPageClient'

export const metadata: Metadata = {
  title: 'Lista de Espera',
  description: 'Gerencie os pacientes na lista de espera',
}

export const dynamic = 'force-dynamic'

export default async function WaitlistPage() {
  const session = await getSessionProfile()
  if (!session) redirect('/login')

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('conversations')
    .select('id, patient_name, patient_phone, waitlist_preferred_time_start, waitlist_preferred_time_end, waitlist_appointment_type, waitlist_expires_at, updated_at')
    .eq('clinic_id', session.clinic.id)
    .eq('status', 'waitlist')
    .or(`waitlist_expires_at.is.null,waitlist_expires_at.gt.${now}`)
    .order('updated_at', { ascending: true })

  return <WaitlistPageClient initialEntries={data ?? []} />
}
