import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPatientAppointmentsMock, hasGestaoDSIntegrationMock } = vi.hoisted(() => ({
  getPatientAppointmentsMock: vi.fn(),
  hasGestaoDSIntegrationMock: vi.fn(),
}))

vi.mock('./actions', async () => {
  return {
    parseDayText: vi.fn(),
    parseTimeText: vi.fn(),
    formatSlotLabel: vi.fn(),
    createAppointment: vi.fn(),
    createAppointmentFromSlot: vi.fn(),
    cancelAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    addToWaitlist: vi.fn(),
    getPatientAppointments: getPatientAppointmentsMock,
    hasGestaoDSIntegration: hasGestaoDSIntegrationMock,
    normalizeCpf: (value: string | null | undefined) => {
      if (!value) return null
      const digits = String(value).replace(/\D/g, '')
      return digits.length === 11 ? digits : null
    },
  }
})

import { handleBotTurn } from './engine'

describe('handleBotTurn - GestaoDS CPF lookup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reopens the main menu when the user types menu while already in menu state', async () => {
    const response = await handleBotTurn(
      'conv-1',
      'menu',
      'menu',
      {
        patientPhone: '5511999999999',
        patientName: 'Paciente Teste',
      },
      null,
      '5511999999999',
      'clinic-1',
    )

    expect(response.nextState).toBe('menu')
    expect(response.message).toContain('Como posso te ajudar')
  })

  it('asks for CPF when no appointments were found and GestaoDS is connected', async () => {
    hasGestaoDSIntegrationMock.mockResolvedValue(true)

    const response = await handleBotTurn(
      'conv-1',
      '5',
      'menu',
      {
        patientPhone: '5511999999999',
        appointments: [],
      },
      null,
      '5511999999999',
      'clinic-1',
    )

    expect(response.nextState).toBe('consultar_cpf')
    expect(response.message).toContain('CPF')
    expect(response.nextContext.intent).toBe('view_appointments')
  })

  it('resumes appointment lookup after receiving a valid CPF', async () => {
    getPatientAppointmentsMock.mockResolvedValue([
      {
        id: 'apt-1',
        startsAt: '2026-04-20T13:00:00.000Z',
        label: 'Segunda-feira, 20/04 às 10h00',
        status: 'scheduled',
      },
    ])

    const response = await handleBotTurn(
      'conv-1',
      '123.456.789-01',
      'consultar_cpf',
      {
        patientPhone: '5511999999999',
        patientName: 'Paciente Teste',
        intent: 'view_appointments',
      },
      null,
      '5511999999999',
      'clinic-1',
    )

    expect(getPatientAppointmentsMock).toHaveBeenCalledWith(
      'clinic-1',
      '5511999999999',
      '12345678901',
    )
    expect(response.nextState).toBe('ver_agendamentos')
    expect(response.patientCpf).toBe('12345678901')
    expect(response.message).toContain('agendamentos')
  })
})
