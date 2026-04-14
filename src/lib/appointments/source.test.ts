import { describe, expect, it } from 'vitest'

import {
  getAppointmentOriginLabel,
  getAppointmentSyncLabel,
  matchesAppointmentSourceFilter,
  normalizeAppointmentOrigin,
  resolveAppointmentOrigin,
} from './source'

describe('appointment source helpers', () => {
  it('classifies bot appointments even when synced to GestaoDS', () => {
    const appointment = {
      provider: 'gestaods',
      conversation_id: 'conv-1',
      description: 'Agendamento via WhatsApp',
    }

    expect(resolveAppointmentOrigin(appointment)).toBe('bot_whatsapp')
    expect(matchesAppointmentSourceFilter(appointment, 'bot')).toBe(true)
    expect(matchesAppointmentSourceFilter(appointment, 'gestaods')).toBe(false)
  })

  it('keeps manual DoctorChatBot appointments under manual even when synced', () => {
    const appointment = {
      origin: 'manual_doctorchat',
      provider: 'gestaods',
      conversation_id: null,
      description: null,
    }

    expect(matchesAppointmentSourceFilter(appointment, 'manual')).toBe(true)
    expect(matchesAppointmentSourceFilter(appointment, 'gestaods')).toBe(false)
    expect(getAppointmentSyncLabel(appointment)).toBe('Sincronizado com GestaoDS')
  })

  it('treats legacy manual provider rows as DoctorChatBot manual', () => {
    const appointment = normalizeAppointmentOrigin({
      provider: 'manual',
      conversation_id: null,
      description: 'Retorno',
    })

    expect(appointment.origin).toBe('manual_doctorchat')
    expect(getAppointmentOriginLabel(appointment)).toBe('Manual no DoctorChatBot')
  })

  it('treats external imports as integration-owned appointments', () => {
    const appointment = {
      provider: 'gestaods',
      conversation_id: null,
      description: null,
    }

    expect(resolveAppointmentOrigin(appointment)).toBe('external_import')
    expect(matchesAppointmentSourceFilter(appointment, 'gestaods')).toBe(true)
    expect(getAppointmentOriginLabel(appointment)).toBe('Importado do GestaoDS')
    expect(getAppointmentSyncLabel(appointment)).toBeNull()
  })
})
