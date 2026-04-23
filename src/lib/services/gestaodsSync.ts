import { addDays, format, subDays } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GestaoDSService } from '@/lib/services/gestaods'
import { sendImmediateAppointmentConfirmation } from '@/lib/services/appointmentNotificationService'

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
    config.gestaods_is_dev ?? false
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
    // ID: campo 'token' na resposta real da API GestaoDS
    const externalId = normalizeString(
      sourceAppointment.token || sourceAppointment.id || sourceAppointment.agendamento
    )

    // Datas no formato "dd/mm/yyyy hh:mm" — precisa converter para ISO
    const startsAtRaw = normalizeString(
      sourceAppointment.data_agendamento || sourceAppointment.data_hora_inicio || sourceAppointment.starts_at
    )
    const endsAtRaw = normalizeString(
      sourceAppointment.data_fim_agendamento || sourceAppointment.data_hora_fim || sourceAppointment.ends_at
    )

    if (!externalId || !startsAtRaw || !endsAtRaw) {
      summary.skipped += 1
      continue
    }

    const startsAt = parseGestaoDSDate(startsAtRaw)
    const endsAt = parseGestaoDSDate(endsAtRaw)

    if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      summary.errors.push(`Datas inválidas no agendamento ${externalId}: "${startsAtRaw}" / "${endsAtRaw}"`)
      continue
    }

    // Status derivado dos booleanos da API GestaoDS
    const sourceStatus = mapGestaoDSStatus(sourceAppointment)

    // Paciente está aninhado em sourceAppointment.paciente.{nome,celular}
    const paciente =
      sourceAppointment.paciente && typeof sourceAppointment.paciente === 'object'
        ? (sourceAppointment.paciente as Record<string, unknown>)
        : {}
    let patientName = normalizeString(paciente.nome || sourceAppointment.paciente_nome) || 'Paciente GestãoDS'
    let patientPhone = normalizeString(paciente.celular || sourceAppointment.paciente_celular) || ''
    const patientCpf = normalizeString(paciente.cpf || sourceAppointment.paciente_cpf || sourceAppointment.cpf)

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
      const { data: insertedAppointment, error: insertError } = await supabase
        .from('appointments')
        .insert({
          clinic_id: config.clinic_id,
          origin: 'external_import',
          provider: 'gestaods',
          provider_reference_id: externalId,
          ...payload,
        })
        .select('id, starts_at, status, patient_phone')
        .single()

      if (insertError) {
        summary.errors.push(`Erro ao criar agendamento ${externalId}: ${insertError.message}`)
      } else {
        summary.created += 1

        const isFutureAppointment = new Date(startsAt) > new Date()
        const isActiveStatus = sourceStatus === 'scheduled' || sourceStatus === 'confirmed'
        const hasValidPhone = Boolean(patientPhone && patientPhone !== '00000000000')

        if (insertedAppointment?.id && isFutureAppointment && isActiveStatus && hasValidPhone) {
          try {
            await sendImmediateAppointmentConfirmation({
              clinicId: config.clinic_id,
              appointmentId: insertedAppointment.id,
              conversationId: null,
            })
          } catch (notificationError) {
            const message =
              notificationError instanceof Error
                ? notificationError.message
                : 'erro desconhecido ao enviar confirmacao'
            summary.errors.push(`Erro ao enviar confirmacao do agendamento ${externalId}: ${message}`)
          }
        }
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

/**
 * Parseia data no formato GestaoDS: "dd/mm/yyyy hh:mm" ou "dd/mm/yyyy hh:mm:ss"
 * GestaoDS usa horário de Brasília (UTC-3). Adicionamos o offset explicitamente
 * para garantir que o ISO gerado seja UTC correto independentemente do timezone do servidor.
 */
function parseGestaoDSDate(raw: string): Date | null {
  if (!raw) return null
  // Tenta parse ISO nativo primeiro (caso futuramente a API mude para ISO)
  if (raw.includes('-') && !raw.startsWith('0')) {
    const iso = new Date(raw)
    if (!Number.isNaN(iso.getTime())) return iso
  }
  // Formato brasileiro: "06/04/2026 08:40" ou "06/04/2026 08:40:00"
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[\s T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return null
  const [, day, month, year, hours = '00', minutes = '00', seconds = '00'] = match
  // Interpreta como Brasília (UTC-3) para armazenar UTC correto no banco
  const isoWithOffset = `${year}-${month}-${day}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}-03:00`
  const d = new Date(isoWithOffset)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Deriva o status do agendamento a partir dos booleanos da API GestaoDS
 */
function mapGestaoDSStatus(appt: Record<string, unknown>): string {
  if (appt.cancelado) return 'canceled'
  if (appt.faltou) return 'no_show'
  if (appt.finalizado) return 'completed'
  if (appt.confirmado) return 'confirmed'
  return 'scheduled'
}

