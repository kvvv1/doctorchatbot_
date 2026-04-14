import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '@/lib/calendar/googleCalendar'
import { GestaoDSService, GestaoDSServiceHelpers } from '@/lib/services/gestaods'
import type { SupabaseClient } from '@supabase/supabase-js'

type IntegrationProvider = 'none' | 'google' | 'gestaods'

type GoogleConfig = {
  accessToken: string
  refreshToken: string
  calendarId: string
}

type IntegrationResolution = {
  provider: IntegrationProvider
  google?: GoogleConfig
  gestaods?: {
    apiToken: string
    isDev: boolean
  }
}

export type ExternalCreateResult = {
  provider: IntegrationProvider
  synced: boolean
  providerReferenceId?: string
  error?: string
}

export async function createExternalAppointment(params: {
  supabase: SupabaseClient
  clinicId: string
  patientName: string
  patientPhone: string
  startsAt: Date
  endsAt: Date
  description?: string | null
  conversationId?: string | null
  /** CPF do paciente (obrigatório para GestaoDS quando não existe conversa vinculada) */
  cpf?: string | null
}): Promise<ExternalCreateResult> {
  const resolution = await resolveClinicIntegration(params.supabase, params.clinicId)

  if (resolution.provider === 'google' && resolution.google) {
    try {
      const eventId = await createCalendarEvent({
        accessToken: resolution.google.accessToken,
        refreshToken: resolution.google.refreshToken,
        calendarId: resolution.google.calendarId,
        title: `Consulta - ${params.patientName}`,
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        description:
          params.description ||
          `Paciente: ${params.patientName}\nTelefone: ${params.patientPhone}`,
        patientPhone: params.patientPhone,
      })

      return {
        provider: 'google',
        synced: true,
        providerReferenceId: eventId,
      }
    } catch (error) {
      return {
        provider: 'google',
        synced: false,
        error: error instanceof Error ? error.message : 'Falha ao sincronizar com Google Calendar',
      }
    }
  }

  if (resolution.provider === 'gestaods') {
    if (!resolution.gestaods) {
      return {
        provider: 'gestaods',
        synced: false,
        error: 'Integração GestãoDS não configurada corretamente.',
      }
    }

    const cpf = params.cpf
      ? normalizeRawCpf(params.cpf)
      : await resolvePatientCpf({
          supabase: params.supabase,
          clinicId: params.clinicId,
          patientPhone: params.patientPhone,
          conversationId: params.conversationId,
        })

    if (!cpf) {
      return {
        provider: 'gestaods',
        synced: false,
        error: 'CPF do paciente não encontrado. Informe o CPF ao criar o agendamento.',
      }
    }

    const gestaoService = new GestaoDSService(
      resolution.gestaods.apiToken,
      resolution.gestaods.isDev
    )

    const bookingResult = await gestaoService.bookAppointment({
      cpf,
      data_agendamento: formatGestaoDSDate(params.startsAt),
      data_fim_agendamento: formatGestaoDSDate(params.endsAt),
      primeiro_atendimento: false,
    })

    if (!bookingResult.success) {
      return {
        provider: 'gestaods',
        synced: false,
        error: bookingResult.error || 'Falha ao criar agendamento no GestãoDS.',
      }
    }

    const providerReferenceId = GestaoDSServiceHelpers.extractAppointmentId(bookingResult.data)

    if (!providerReferenceId) {
      return {
        provider: 'gestaods',
        synced: false,
        error: 'GestãoDS não retornou identificador do agendamento.',
      }
    }

    return {
      provider: 'gestaods',
      synced: true,
      providerReferenceId,
    }
  }

  return { provider: 'none', synced: false }
}

export async function updateExternalAppointment(params: {
  supabase: SupabaseClient
  clinicId: string
  provider: string
  providerReferenceId?: string | null
  patientName: string
  patientPhone: string
  startsAt: Date
  endsAt: Date
  description?: string | null
}): Promise<{ synced: boolean; error?: string; providerReferenceId?: string }> {
  if (params.provider === 'gestaods') {
    if (!params.providerReferenceId) {
      return {
        synced: false,
        error: 'Agendamento GestãoDS sem referência externa para atualização.',
      }
    }

    const resolution = await resolveClinicIntegration(params.supabase, params.clinicId)
    if (resolution.provider !== 'gestaods' || !resolution.gestaods) {
      return {
        synced: false,
        error: 'Integração GestãoDS não configurada para atualização.',
      }
    }

    const cpf = await resolvePatientCpf({
      supabase: params.supabase,
      clinicId: params.clinicId,
      patientPhone: params.patientPhone,
    })

    if (!cpf) {
      return {
        synced: false,
        error: 'CPF do paciente não encontrado para atualizar no GestãoDS.',
      }
    }

    try {
      const gestaoService = new GestaoDSService(
        resolution.gestaods.apiToken,
        resolution.gestaods.isDev
      )

      const reschedule = await gestaoService.rescheduleAppointment({
        currentAppointmentId: params.providerReferenceId,
        cpf,
        newStartDate: formatGestaoDSDate(params.startsAt),
        newEndDate: formatGestaoDSDate(params.endsAt),
        reason: 'Remarcado via Doctor Chat Bot',
        primeiroAtendimento: false,
      })

      if (!reschedule.success) {
        return {
          synced: false,
          error: reschedule.error || 'Falha ao remarcar no GestãoDS.',
        }
      }

      const newProviderReferenceId = reschedule.data?.newAppointmentId || null
      if (!newProviderReferenceId) {
        return {
          synced: false,
          error: 'GestãoDS não retornou ID do novo agendamento.',
        }
      }

      return {
        synced: true,
        providerReferenceId: newProviderReferenceId,
      }
    } catch (error) {
      return {
        synced: false,
        error: error instanceof Error ? error.message : 'Falha ao atualizar no GestãoDS.',
      }
    }
  }

  if (params.provider !== 'google' || !params.providerReferenceId) {
    return { synced: false }
  }

  const resolution = await resolveClinicIntegration(params.supabase, params.clinicId)
  if (resolution.provider !== 'google' || !resolution.google) {
    return { synced: false, error: 'Integração Google não configurada para atualização.' }
  }

  try {
    await updateCalendarEvent({
      accessToken: resolution.google.accessToken,
      refreshToken: resolution.google.refreshToken,
      calendarId: resolution.google.calendarId,
      eventId: params.providerReferenceId,
      title: `Consulta - ${params.patientName}`,
      description: params.description || undefined,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      patientPhone: params.patientPhone,
    })

    return { synced: true, providerReferenceId: params.providerReferenceId }
  } catch (error) {
    return {
      synced: false,
      error: error instanceof Error ? error.message : 'Falha ao atualizar no Google Calendar',
    }
  }
}

export async function cancelExternalAppointment(params: {
  supabase: SupabaseClient
  clinicId: string
  provider: string
  providerReferenceId?: string | null
}): Promise<{ synced: boolean; error?: string }> {
  if (params.provider === 'gestaods' && params.providerReferenceId) {
    const resolution = await resolveClinicIntegration(params.supabase, params.clinicId)

    if (resolution.provider !== 'gestaods' || !resolution.gestaods) {
      return {
        synced: false,
        error: 'Integração GestãoDS não configurada para cancelamento.',
      }
    }

    try {
      const gestaoService = new GestaoDSService(
        resolution.gestaods.apiToken,
        resolution.gestaods.isDev
      )

      const cancellation = await gestaoService.cancelAppointment(
        params.providerReferenceId,
        'Cancelado via Doctor Chat Bot'
      )

      if (!cancellation.success) {
        return {
          synced: false,
          error: cancellation.error || 'Falha ao cancelar no GestãoDS.',
        }
      }

      return { synced: true }
    } catch (error) {
      return {
        synced: false,
        error: error instanceof Error ? error.message : 'Falha ao cancelar no GestãoDS.',
      }
    }
  }

  if (params.provider !== 'google' || !params.providerReferenceId) {
    return { synced: false }
  }

  const resolution = await resolveClinicIntegration(params.supabase, params.clinicId)
  if (resolution.provider !== 'google' || !resolution.google) {
    return { synced: false, error: 'Integração Google não configurada para cancelamento.' }
  }

  try {
    await deleteCalendarEvent(
      resolution.google.accessToken,
      resolution.google.refreshToken,
      resolution.google.calendarId,
      params.providerReferenceId
    )

    return { synced: true }
  } catch (error) {
    return {
      synced: false,
      error: error instanceof Error ? error.message : 'Falha ao cancelar no Google Calendar',
    }
  }
}

async function resolveClinicIntegration(
  supabase: SupabaseClient,
  clinicId: string
): Promise<IntegrationResolution> {
  const clinicIntegrations = await tryLoadClinicIntegrations(supabase, clinicId)

  const gestaods = clinicIntegrations.find((item) => item.provider === 'gestaods')
  if (gestaods?.gestaods_api_token) {
    return {
      provider: 'gestaods',
      gestaods: {
        apiToken: gestaods.gestaods_api_token,
        isDev: gestaods.gestaods_is_dev ?? false,
      },
    }
  }

  const googleIntegration = clinicIntegrations.find((item) => item.provider === 'google')
  if (
    googleIntegration?.google_access_token &&
    googleIntegration?.google_refresh_token
  ) {
    return {
      provider: 'google',
      google: {
        accessToken: googleIntegration.google_access_token,
        refreshToken: googleIntegration.google_refresh_token,
        calendarId: googleIntegration.google_calendar_id || 'primary',
      },
    }
  }

  const { data: legacyGoogle } = await supabase
    .from('calendar_integrations')
    .select('google_access_token, google_refresh_token, google_calendar_id')
    .eq('clinic_id', clinicId)
    .eq('is_connected', true)
    .maybeSingle()

  if (legacyGoogle?.google_access_token && legacyGoogle?.google_refresh_token) {
    return {
      provider: 'google',
      google: {
        accessToken: legacyGoogle.google_access_token,
        refreshToken: legacyGoogle.google_refresh_token,
        calendarId: legacyGoogle.google_calendar_id || 'primary',
      },
    }
  }

  return { provider: 'none' }
}

async function tryLoadClinicIntegrations(supabase: SupabaseClient, clinicId: string) {
  try {
    const { data } = await supabase
      .from('clinic_integrations')
      .select(
        'provider, is_connected, google_access_token, google_refresh_token, google_calendar_id, gestaods_api_token, gestaods_is_dev'
      )
      .eq('clinic_id', clinicId)
      .eq('is_connected', true)

    return data || []
  } catch {
    return []
  }
}

/**
 * Formata uma data UTC para o formato esperado pela API GestaoDS.
 * A API espera o horário no fuso de Brasília (UTC-3).
 * Vercel roda em UTC, então precisamos subtrair 3 horas antes de usar getUTC*.
 */
function formatGestaoDSDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  // Desloca para UTC-3 (Brasília)
  const br = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  const formatted = `${pad(br.getUTCDate())}/${pad(br.getUTCMonth() + 1)}/${br.getUTCFullYear()} ${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}:${pad(br.getUTCSeconds())}`
  console.log('[formatGestaoDSDate] Converting:', {
    input: date.toISOString(),
    dateTime: date.getTime(),
    adjusted: br.toISOString(),
    output: formatted,
  })
  return formatted
}

function normalizeRawCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const clean = cpf.replace(/\D/g, '')
  return clean.length === 11 ? clean : null
}

async function resolvePatientCpf(params: {
  supabase: SupabaseClient
  clinicId: string
  patientPhone: string
  conversationId?: string | null
}): Promise<string | null> {
  const normalizeCpf = normalizeRawCpf

  if (params.conversationId) {
    const { data: conversation } = await params.supabase
      .from('conversations')
      .select('cpf')
      .eq('id', params.conversationId)
      .eq('clinic_id', params.clinicId)
      .maybeSingle()

    const cpfFromConversation = normalizeCpf(conversation?.cpf)
    if (cpfFromConversation) {
      return cpfFromConversation
    }
  }

  const { data: latestConversation } = await params.supabase
    .from('conversations')
    .select('cpf')
    .eq('clinic_id', params.clinicId)
    .eq('patient_phone', params.patientPhone)
    .not('cpf', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return normalizeCpf(latestConversation?.cpf)
}
