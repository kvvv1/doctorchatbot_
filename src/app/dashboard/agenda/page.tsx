import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { checkSubscription } from '@/lib/services/subscriptionService'
import { hasFeatureAccess, PlanFeature } from '@/lib/services/planFeatures'
import UpgradePrompt from '../components/UpgradePrompt'
import AgendaPageClient from './AgendaPageClient'

export const metadata: Metadata = {
  title: 'Agenda',
  description: 'Gerencie os agendamentos dos seus pacientes',
}

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const session = await getSessionProfile()
  if (!session) redirect('/login')

  // Check calendar integration access
  const subscription = await checkSubscription(session.clinic.id)
  const hasCalendarAccess = hasFeatureAccess(
    subscription.planKey,
    PlanFeature.CALENDAR_INTEGRATION
  )

  // If no access, show upgrade prompt
  if (!hasCalendarAccess) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Agenda</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Gerencie os agendamentos dos seus pacientes
          </p>
        </div>

        <UpgradePrompt
          featureName="Integração com Google Calendar"
          requiredPlans={['Profissional', 'Clinic Pro']}
          currentPlan={subscription.planKey}
        />

        <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-8">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">
            🚀 O que você terá com o upgrade:
          </h3>
          <ul className="space-y-3 text-sm text-neutral-700">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Sincronização automática com Google Calendar</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Agendamento inteligente com disponibilidade automática</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Confirmação automática de consultas</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Lembretes automáticos por WhatsApp</span>
            </li>
          </ul>
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
      <AgendaPageClient initialAppointments={appointments || []} activeProvider={activeProvider} />
    </div>
  )
}

