import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { Metadata } from 'next'
import type { ComponentProps } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { checkSubscription } from '@/lib/services/subscriptionService'
import { hasFeatureAccess, PlanFeature } from '@/lib/services/planFeatures'
import { normalizeAppointmentOrigin } from '@/lib/appointments/source'
import UpgradePrompt from '../components/UpgradePrompt'
import AgendaPageClient from './AgendaPageClient'

type AgendaInitialAppointment =
  ComponentProps<typeof AgendaPageClient>['initialAppointments'][number]

export const metadata: Metadata = {
  title: 'Agenda',
  description: 'Gerencie os agendamentos dos seus pacientes',
}

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const session = await getSessionProfile()
  if (!session) redirect('/login')

  const subscription = await checkSubscription(session.clinic.id)
  const hasAgendaAccess =
    subscription.isActive &&
    hasFeatureAccess(subscription.planKey, PlanFeature.AGENDA)

  if (!hasAgendaAccess) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Agenda</h1>
          <p className="mt-1 text-sm text-neutral-900">
            Gerencie os agendamentos dos seus pacientes
          </p>
        </div>

        <UpgradePrompt
          featureName="Agenda manual e via chatbot"
          requiredPlans={['Essencial', 'Profissional', 'Clinic Pro', 'Fundador']}
          currentPlan={subscription.planKey}
        />

        <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          Os planos Essencial e superiores incluem agenda manual e
          agendamentos pelo DoctorChatBot. As integrações externas via API,
          como Google Calendar e outros sistemas, continuam sendo recursos dos
          planos Profissional e Clinic Pro.
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const clinicId = session.clinic.id

  // Buscar qual integração de agenda está ativa para essa clínica
  const { data: integrations } = await admin
    .from('clinic_integrations')
    .select('provider')
    .eq('clinic_id', clinicId)
    .eq('is_connected', true)

  // Prioridade: gestaods > google > null
  const activeProvider: 'gestaods' | 'google' | null =
    integrations?.find((i) => i.provider === 'gestaods')
      ? 'gestaods'
      : integrations?.find((i) => i.provider === 'google')
      ? 'google'
      : null

  // Carregar appointments do mês atual
  const now = new Date()
  const startDate = startOfWeek(startOfMonth(now))
  const endDate = endOfWeek(endOfMonth(now))

  const { data: appointments } = await supabase
    .from('appointments')
    .select(
      `
      *,
      conversation:conversations(
        id,
        patient_name,
        patient_phone,
        status
      )
    `
    )
    .eq('clinic_id', clinicId)
    .gte('starts_at', startDate.toISOString())
    .lte('starts_at', endDate.toISOString())
    .order('starts_at', { ascending: true })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AgendaPageClient
        initialAppointments={(appointments || []).map((appointment: AgendaInitialAppointment) =>
          normalizeAppointmentOrigin(appointment)
        )}
        activeProvider={activeProvider}
      />
    </div>
  )
}

