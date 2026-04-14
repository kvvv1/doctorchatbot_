export type AppointmentOrigin = 'manual_doctorchat' | 'bot_whatsapp' | 'external_import'

export type AppointmentSourceFilter = 'all' | 'bot' | 'manual' | 'google' | 'gestaods'

type AppointmentSourceInput = {
  origin?: string | null
  provider?: string | null
  conversation_id?: string | null
  description?: string | null
}

function isBotDescription(description: string | null | undefined): boolean {
  return (description || '').toLowerCase().includes('via whatsapp')
}

export function resolveAppointmentOrigin(
  appointment: AppointmentSourceInput,
): AppointmentOrigin {
  if (appointment.origin === 'manual_doctorchat') return 'manual_doctorchat'
  if (appointment.origin === 'bot_whatsapp') return 'bot_whatsapp'
  if (appointment.origin === 'external_import') return 'external_import'

  if (appointment.conversation_id && isBotDescription(appointment.description)) {
    return 'bot_whatsapp'
  }

  if (appointment.provider === 'manual') {
    return 'manual_doctorchat'
  }

  return 'external_import'
}

export function normalizeAppointmentOrigin<T extends AppointmentSourceInput>(
  appointment: T,
): T & { origin: AppointmentOrigin } {
  return {
    ...appointment,
    origin: resolveAppointmentOrigin(appointment),
  }
}

export function isBotAppointment(appointment: AppointmentSourceInput): boolean {
  return resolveAppointmentOrigin(appointment) === 'bot_whatsapp'
}

export function matchesAppointmentSourceFilter(
  appointment: AppointmentSourceInput,
  source: Exclude<AppointmentSourceFilter, 'all'>,
): boolean {
  const origin = resolveAppointmentOrigin(appointment)

  if (source === 'bot') return origin === 'bot_whatsapp'
  if (source === 'manual') return origin === 'manual_doctorchat'
  if (source === 'google') {
    return origin === 'external_import' && appointment.provider === 'google'
  }
  if (source === 'gestaods') {
    return origin === 'external_import' && appointment.provider === 'gestaods'
  }

  return true
}

export function getAppointmentOriginLabel(
  appointment: AppointmentSourceInput,
): string {
  const origin = resolveAppointmentOrigin(appointment)

  if (origin === 'bot_whatsapp') return 'Bot WhatsApp'
  if (origin === 'manual_doctorchat') return 'Manual no DoctorChatBot'

  if (appointment.provider === 'google') {
    return 'Importado do Google Calendar'
  }

  return 'Importado do GestaoDS'
}

export function getAppointmentSyncLabel(
  appointment: AppointmentSourceInput,
): string | null {
  const origin = resolveAppointmentOrigin(appointment)

  if (origin === 'external_import') return null
  if (appointment.provider === 'gestaods') return 'Sincronizado com GestaoDS'
  if (appointment.provider === 'google') return 'Sincronizado com Google Calendar'
  return 'Somente no DoctorChatBot'
}
