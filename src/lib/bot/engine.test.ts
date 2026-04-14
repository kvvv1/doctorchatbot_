import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPatientAppointmentsMock, hasGestaoDSIntegrationMock, createAppointmentFromSlotMock } = vi.hoisted(() => ({
  getPatientAppointmentsMock: vi.fn(),
  hasGestaoDSIntegrationMock: vi.fn(),
  createAppointmentFromSlotMock: vi.fn(),
}))

vi.mock('./actions', async () => {
  return {
    parseDayText: vi.fn(),
    parseTimeText: vi.fn(),
    formatSlotLabel: vi.fn(),
    createAppointment: vi.fn(),
    createAppointmentFromSlot: createAppointmentFromSlotMock,
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
      '2',
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

  it('resumes scheduling with the previously selected slot after receiving CPF', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '178.311.876-85',
      'agendar_cpf',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        selectedDay: '2026-05-07',
        selectedDayLabel: 'Quinta-feira, 07/05',
        availableSlots: [
          {
            startsAt: '2026-05-07T18:40:00.000Z',
            endsAt: '2026-05-07T19:00:00.000Z',
            label: '15h40',
          },
        ],
        pendingScheduleSlot: {
          startsAt: '2026-05-07T18:40:00.000Z',
          endsAt: '2026-05-07T19:00:00.000Z',
          label: '15h40',
        },
      },
      null,
      '553195531183',
      'clinic-1',
    )

    expect(createAppointmentFromSlotMock).not.toHaveBeenCalled()
    expect(response.nextState).toBe('agendar_confirmar')
    expect(response.patientCpf).toBe('17831187685')
    expect(response.message).toContain('Está tudo correto?')
    expect(response.message).toContain('1️⃣ Sim, confirmar')
  })

  it('asks for explicit confirmation after selecting slot from list', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '14h20',
      'agendar_hora_lista',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        patientCpf: '17831187685',
        selectedDayLabel: 'Sexta-feira, 08/05',
        availableSlots: [
          {
            startsAt: '2026-05-08T17:20:00.000Z',
            endsAt: '2026-05-08T17:40:00.000Z',
            label: '14h20',
          },
        ],
      },
      {
        message_confirm_schedule: 'ok',
      } as any,
      '553195531183',
      'clinic-1',
    )

    expect(response.nextState).toBe('agendar_confirmar')
    expect(response.message).toContain('Sexta-feira, 08/05')
    expect(response.message).toContain('14h20')
    expect(createAppointmentFromSlotMock).not.toHaveBeenCalled()
  })

  it('creates appointment only after yes in agendar_confirmar', async () => {
    createAppointmentFromSlotMock.mockResolvedValue({
      success: true,
      message: '✅ Agendamento confirmado!',
    })

    const response = await handleBotTurn(
      'conv-1',
      '1',
      'agendar_confirmar',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        patientCpf: '17831187685',
        pendingScheduleSlot: {
          startsAt: '2026-05-08T17:20:00.000Z',
          endsAt: '2026-05-08T17:40:00.000Z',
          label: '14h20',
        },
      },
      {
        message_confirm_schedule: 'ok',
      } as any,
      '553195531183',
      'clinic-1',
    )

    expect(createAppointmentFromSlotMock).toHaveBeenCalledTimes(1)
    expect(response.nextState).toBe('menu')
    expect(response.message).toContain('Agendamento confirmado')
  })
})
