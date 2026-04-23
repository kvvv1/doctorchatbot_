import { describe, expect, it } from 'vitest'
import {
  formatAppointmentAlertLabel,
  formatAppointmentDateTime,
  formatAppointmentShortDate,
  formatAppointmentShortTime,
} from './appointmentDateTime'

describe('appointmentDateTime', () => {
  it('formats UTC timestamps in Sao Paulo time', () => {
    const startsAt = '2026-05-06T20:20:00.000Z'

    expect(formatAppointmentShortDate(startsAt)).toBe('quarta, 06/05')
    expect(formatAppointmentShortTime(startsAt)).toBe("17h20")
    expect(formatAppointmentDateTime(startsAt)).toBe('quarta, 06/05 às 17:20')
    expect(formatAppointmentAlertLabel(startsAt)).toBe('06/05 as 17:20')
  })
})
