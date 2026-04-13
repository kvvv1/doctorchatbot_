import { addDays, format, subDays } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GestaoDSService } from '@/lib/services/gestaods'

type ClinicIntegrationConfig = {
  id: string
  clinic_id: string
  gestaods_api_token: string | null
  gestaods_is_dev: boolean | null
}

export type GestaoDSSyncSummary = {
  clinicId: string
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export async function syncGestaoDSClinic(params: {
  supabase: SupabaseClient
  config: ClinicIntegrationConfig
  daysPast?: number
  daysFuture?: number
}): Promise<GestaoDSSyncSummary> {
  const { supabase, config } = params

  const summary: GestaoDSSyncSummary = {
    clinicId: config.clinic_id,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  if (!config.gestaods_api_token) {
    summary.errors.push('Token GestãoDS não configurado.')
    return summary
  }

  const daysPast = params.daysPast ?? 1
  const daysFuture = params.daysFuture ?? 30

  const gestaoService = new GestaoDSService(
    config.gestaods_api_token,
    config.gestaods_is_dev ?? true
  )

  const startDate = format(subDays(new Date(), daysPast), 'yyyy-MM-dd')
  const endDate = format(addDays(new Date(), daysFuture), 'yyyy-MM-dd')

  const listResult = await gestaoService.listAppointments(startDate, endDate)
  if (!listResult.success || !listResult.data) {
    summary.errors.push(`Falha ao listar agendamentos: ${listResult.error || 'erro desconhecido'}`)
    await persistSyncStatus(supabase, config.id, summary.errors)
    return summary
  }

  for (const sourceAppointment of listResult.data) {
    const externalId = normalizeString(
      sourceAppointment.id || sourceAppointment.token || sourceAppointment.agendamento
    )

    const startsAtRaw =
      sourceAppointment.data_hora_inicio || sourceAppointment.starts_at || sourceAppointment.data_agendamento
    const endsAtRaw =
      sourceAppointment.data_hora_fim || sourceAppointment.ends_at || sourceAppointment.data_fim_agendamento

    if (!externalId || !startsAtRaw || !endsAtRaw) {
      summary.skipped += 1
      continue
    }

    const startsAt = new Date(startsAtRaw)
    const endsAt = new Date(endsAtRaw)

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      summary.errors.push(`Datas inválidas no agendamento ${externalId}`)
      continue
    }

    const sourceStatus = mapStatus(sourceAppointment.status_nome || sourceAppointment.status || 'scheduled')

    let patientName = normalizeString(sourceAppointment.paciente_nome) || 'Paciente GestãoDS'
    let patientPhone = normalizeString(sourceAppointment.paciente_celular) || ''
    const patientCpf = normalizeString(sourceAppointment.paciente_cpf || sourceAppointment.cpf)

    if (!patientPhone && patientCpf) {
      const patientResult = await gestaoService.getPatient(patientCpf)
      if (patientResult.success && patientResult.data) {
        patientName = normalizeString(patientResult.data.nome) || patientName
        patientPhone = normalizeString(patientResult.data.celular) || patientPhone
      }
    }

    const { data: existing, error: fetchExistingError } = await supabase
      .from('appointments')
      .select('id, starts_at, ends_at, status, patient_name, patient_phone')
      .eq('clinic_id', config.clinic_id)
      .eq('provider', 'gestaods')
      .eq('provider_reference_id', externalId)
      .maybeSingle()

    if (fetchExistingError) {
      summary.errors.push(`Erro ao buscar agendamento ${externalId}: ${fetchExistingError.message}`)
      continue
    }

    const payload = {
      patient_name: patientName,
      patient_phone: patientPhone || '00000000000',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: sourceStatus,
      updated_at: new Date().toISOString(),
    }

    if (!existing) {
      const { error: insertError } = await supabase
        .from('appointments')
        .insert({
          clinic_id: config.clinic_id,
          provider: 'gestaods',
          provider_reference_id: externalId,
          ...payload,
        })

      if (insertError) {
        summary.errors.push(`Erro ao criar agendamento ${externalId}: ${insertError.message}`)
      } else {
        summary.created += 1
      }

      continue
    }

    const hasChanged =
      existing.starts_at !== payload.starts_at ||
      existing.ends_at !== payload.ends_at ||
      existing.status !== payload.status ||
      existing.patient_name !== payload.patient_name ||
      existing.patient_phone !== payload.patient_phone

    if (!hasChanged) {
      summary.skipped += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', existing.id)

    if (updateError) {
      summary.errors.push(`Erro ao atualizar agendamento ${externalId}: ${updateError.message}`)
    } else {
      summary.updated += 1
    }
  }

  await persistSyncStatus(supabase, config.id, summary.errors)
  return summary
}

async function persistSyncStatus(
  supabase: SupabaseClient,
  integrationId: string,
  errors: string[]
) {
  await supabase
    .from('clinic_integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: errors.length > 0 ? errors.slice(0, 5).join(' | ') : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId)
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const output = String(value).trim()
  return output.length > 0 ? output : null
}

function mapStatus(sourceStatus: string): string {
  const status = sourceStatus.toLowerCase()
  if (status.includes('confirm')) return 'confirmed'
  if (status.includes('canc')) return 'canceled'
  if (status.includes('falt') || status.includes('show')) return 'no_show'
  if (status.includes('done') || status.includes('realiz')) return 'completed'
  return 'scheduled'
}
