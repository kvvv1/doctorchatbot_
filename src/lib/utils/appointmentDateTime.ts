import { formatInTimeZone } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'

export const BRAZIL_TIME_ZONE = 'America/Sao_Paulo'

type DateInput = string | Date

export function formatAppointmentInBrazil(
  value: DateInput,
  pattern: string
): string {
  return formatInTimeZone(value, BRAZIL_TIME_ZONE, pattern, { locale: ptBR })
}

export function getAppointmentTemplateParts(value: DateInput): {
  date: string
  time: string
  day: string
} {
  return {
    date: formatAppointmentInBrazil(value, "dd 'de' MMMM"),
    time: formatAppointmentInBrazil(value, 'HH:mm'),
    day: formatAppointmentInBrazil(value, "EEEE, dd 'de' MMMM"),
  }
}

export function formatAppointmentShortDate(value: DateInput): string {
  return formatAppointmentInBrazil(value, 'EEE, dd/MM')
}

export function formatAppointmentShortTime(value: DateInput): string {
  return formatAppointmentInBrazil(value, "HH'h'mm")
}

export function formatAppointmentDateTime(value: DateInput): string {
  return formatAppointmentInBrazil(value, "EEE, dd/MM 'às' HH:mm")
}

export function formatAppointmentSlotLabel(value: DateInput): string {
  return formatAppointmentInBrazil(value, "EEEE, dd/MM 'às' HH'h'mm")
}

export function formatAppointmentAlertLabel(value: DateInput): string {
  return formatAppointmentInBrazil(value, "dd/MM 'as' HH:mm")
}
