import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '@/lib/calendar/googleCalendar'
import { GestaoDSService, GestaoDSServiceHelpers } from '@/lib/services/gestaods'
import { getBrazilianPhoneLookupCandidates } from '@/lib/utils/phone'
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
  /** Tipo de consulta: particular ou convênio */
  appointmentType?: 'particular' | 'convenio'
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

    const startsAtFormatted = await gestaoService.formatDateForApi(params.startsAt)
    const endsAtFormatted = await gestaoService.formatDateForApi(params.endsAt)

    const bookingResult = await gestaoService.bookAppointment({
      cpf,
      data_agendamento: startsAtFormatted,
      data_fim_agendamento: endsAtFormatted,
      primeiro_atendimento: false,
      tipo_consulta: params.appointmentType || 'particular',
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

    let cpf = await resolvePatientCpf({
      supabase: params.supabase,
      clinicId: params.clinicId,
      patientPhone: params.patientPhone,
    })

    if (!cpf) {
      cpf = await resolveGestaoDSPatientCpfFromAppointment(
        params.providerReferenceId,
        resolution.gestaods.apiToken,
        resolution.gestaods.isDev
      )
    }

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

      const startsAtFormatted = await gestaoService.formatDateForApi(params.startsAt)
      const endsAtFormatted = await gestaoService.formatDateForApi(params.endsAt)

      const reschedule = await gestaoService.rescheduleAppointment({
        currentAppointmentId: params.providerReferenceId,
        cpf,
        newStartDate: startsAtFormatted,
        newEndDate: endsAtFormatted,
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

function normalizeRawCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const clean = cpf.replace(/\D/g, '')
  return clean.length === 11 ? clean : null
}

function extractCpfFromConversationRecord(record: { cpf?: string | null; bot_context?: unknown } | null | undefined): string | null {
  const cpfFromColumn = normalizeRawCpf(record?.cpf)
  if (cpfFromColumn) return cpfFromColumn

  if (record?.bot_context && typeof record.bot_context === 'object') {
    return normalizeRawCpf(String((record.bot_context as Record<string, unknown>).patientCpf || ''))
  }

  return null
}

async function resolvePatientCpf(params: {
  supabase: SupabaseClient
  clinicId: string
  patientPhone: string
  conversationId?: string | null
}): Promise<string | null> {
  const normalizeCpf = normalizeRawCpf
  const phoneCandidates = getBrazilianPhoneLookupCandidates(params.patientPhone)

  if (params.conversationId) {
    const { data: conversation, error: conversationError } = await params.supabase
      .from('conversations')
      .select('cpf, bot_context')
      .eq('id', params.conversationId)
      .eq('clinic_id', params.clinicId)
      .maybeSingle()

    if (conversationError?.code === 'PGRST204' && conversationError.message?.includes("'cpf' column")) {
      const { data: fallbackConversation } = await params.supabase
        .from('conversations')
        .select('bot_context')
        .eq('id', params.conversationId)
        .eq('clinic_id', params.clinicId)
        .maybeSingle()

      const cpfFromFallbackConversation = extractCpfFromConversationRecord(fallbackConversation)
      if (cpfFromFallbackConversation) {
        return cpfFromFallbackConversation
      }
    }

    const cpfFromConversation = extractCpfFromConversationRecord(conversation)
    if (cpfFromConversation) {
      return cpfFromConversation
    }
  }

  const { data: latestConversations, error: latestConversationError } = await params.supabase
    .from('conversations')
    .select('cpf, bot_context')
    .eq('clinic_id', params.clinicId)
    .in('patient_phone', phoneCandidates)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (latestConversationError?.code === 'PGRST204' && latestConversationError.message?.includes("'cpf' column")) {
    const { data: fallbackConversations } = await params.supabase
      .from('conversations')
      .select('bot_context')
      .eq('clinic_id', params.clinicId)
      .in('patient_phone', phoneCandidates)
      .order('updated_at', { ascending: false })
      .limit(10)

    const fallbackConversationRecords = Array.isArray(fallbackConversations)
      ? fallbackConversations
      : fallbackConversations
        ? [fallbackConversations]
        : []

    for (const conversation of fallbackConversationRecords) {
      const cpfFromFallbackConversation = extractCpfFromConversationRecord(conversation)
      if (cpfFromFallbackConversation) {
        return cpfFromFallbackConversation
      }
    }

    return null
  }

  const conversationRecords = Array.isArray(latestConversations)
    ? latestConversations
    : latestConversations
      ? [latestConversations]
      : []

  for (const conversation of conversationRecords) {
    const cpfFromConversation = extractCpfFromConversationRecord(conversation)
    if (cpfFromConversation) {
      return cpfFromConversation
    }
  }

  return null
}

async function resolveGestaoDSPatientCpfFromAppointment(
  providerReferenceId: string,
  apiToken: string,
  isDev: boolean
): Promise<string | null> {
  const gestaoService = new GestaoDSService(apiToken, isDev)
  const appointmentResult = await gestaoService.getAppointmentById(providerReferenceId)

  if (!appointmentResult.success) {
    return null
  }

  return GestaoDSServiceHelpers.extractPatientCpf(appointmentResult.data)
}
