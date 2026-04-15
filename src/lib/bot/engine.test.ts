import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BotSettings } from '@/lib/types/database'

const { getPatientAppointmentsMock, hasGestaoDSIntegrationMock, createAppointmentFromSlotMock } = vi.hoisted(() => ({
  getPatientAppointmentsMock: vi.fn(),
  hasGestaoDSIntegrationMock: vi.fn(),
  createAppointmentFromSlotMock: vi.fn(),
}))

const { getSlotsForDayMock } = vi.hoisted(() => ({
  getSlotsForDayMock: vi.fn(),
}))

const { getAvailableDaysMock } = vi.hoisted(() => ({
  getAvailableDaysMock: vi.fn(),
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

vi.mock('./availability', async () => {
  return {
    checkSlotAvailable: vi.fn(),
    getAvailableDays: getAvailableDaysMock,
    getAvailableSlots: vi.fn(),
    getSlotsForDay: getSlotsForDayMock,
  }
})

import { handleBotTurn } from './engine'

function createBotSettings(overrides: Partial<BotSettings> = {}): BotSettings {
  return {
    id: 'bot-settings-1',
    clinic_id: 'clinic-1',
    bot_default_enabled: true,
    working_hours_enabled: false,
    working_hours: {
      timezone: 'America/Sao_Paulo',
      days: [],
    },
    bot_respond_anytime: true,
    bot_scheduling_hours_enabled: false,
    bot_scheduling_hours: {
      timezone: 'America/Sao_Paulo',
      days: [],
    },
    message_welcome: 'Olá',
    message_menu: 'Como posso te ajudar?\n1️⃣ Agendar consulta\n2️⃣ Ver meus agendamentos\n3️⃣ Remarcar consulta\n4️⃣ Cancelar consulta\n5️⃣ Falar com atendente',
    message_out_of_hours: 'Fora do horário',
    message_fallback: 'Não entendi',
    message_confirm_schedule: 'ok',
    message_confirm_reschedule: 'ok',
    message_confirm_cancel: 'ok',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('handleBotTurn - GestaoDS CPF lookup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAvailableDaysMock.mockResolvedValue([
      { date: '2026-05-09', label: 'Sábado, 09/05' },
      { date: '2026-05-10', label: 'Domingo, 10/05' },
    ])
    getSlotsForDayMock.mockResolvedValue([
      {
        startsAt: '2026-05-04T17:20:00.000Z',
        endsAt: '2026-05-04T17:40:00.000Z',
        label: '14h20',
      },
    ])
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
      createBotSettings({
        message_confirm_schedule: 'ok',
      }),
      '553195531183',
      'clinic-1',
    )

    expect(response.nextState).toBe('agendar_confirmar')
    expect(response.message).toContain('Sexta-feira, 08/05')
    expect(response.message).toContain('14h20')
    expect(response.message).toContain('Voltar ao menu principal')
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
      createBotSettings({
        message_confirm_schedule: 'ok',
      }),
      '553195531183',
      'clinic-1',
    )

    expect(createAppointmentFromSlotMock).toHaveBeenCalledTimes(1)
    expect(response.nextState).toBe('menu')
    expect(response.message).toContain('Agendamento confirmado')
  })

  it('returns to menu when the patient selects the menu option in agendar_confirmar', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '3',
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
      createBotSettings({
        message_confirm_schedule: 'ok',
      }),
      '553195531183',
      'clinic-1',
    )

    expect(createAppointmentFromSlotMock).not.toHaveBeenCalled()
    expect(response.nextState).toBe('menu')
    expect(response.message).toContain('Como posso te ajudar')
  })

  it('asks which booking field should be changed when the patient chooses not to confirm', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '2',
      'agendar_confirmar',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        patientCpf: '17831187685',
        selectedDay: '2026-05-08',
        selectedDayLabel: 'Sexta-feira, 08/05',
        pendingScheduleSlot: {
          startsAt: '2026-05-08T17:20:00.000Z',
          endsAt: '2026-05-08T17:40:00.000Z',
          label: '14h20',
        },
      },
      createBotSettings(),
      '553195531183',
      'clinic-1',
    )

    expect(response.nextState).toBe('agendar_alterar_campo')
    expect(response.message).toContain('O que você deseja alterar?')
    expect(response.message).toContain('1️⃣ Data da consulta')
    expect(response.message).toContain('2️⃣ Horário')
    expect(response.message).toContain('3️⃣ Paciente')
  })

  it('changes only the time when the patient selects the horario option', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '2',
      'agendar_alterar_campo',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        patientCpf: '17831187685',
        selectedDay: '2026-05-08',
        selectedDayLabel: 'Sexta-feira, 08/05',
        pendingScheduleSlot: {
          startsAt: '2026-05-08T17:20:00.000Z',
          endsAt: '2026-05-08T17:40:00.000Z',
          label: '14h20',
        },
      },
      createBotSettings(),
      '553195531183',
      'clinic-1',
    )

    expect(getSlotsForDayMock).toHaveBeenCalledWith('clinic-1', '2026-05-08', expect.any(Object))
    expect(response.nextState).toBe('agendar_hora_lista')
    expect(response.message).toContain('Horários disponíveis para *Sexta-feira, 08/05*')
    expect(response.nextContext.selectedDay).toBe('2026-05-08')
    expect(response.nextContext.pendingScheduleSlot).toBeUndefined()
  })

  it('asks for the new patient name and then re-collects CPF before confirming', async () => {
    const choosePatientResponse = await handleBotTurn(
      'conv-1',
      '3',
      'agendar_alterar_campo',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        patientCpf: '17831187685',
        selectedDay: '2026-05-08',
        selectedDayLabel: 'Sexta-feira, 08/05',
        pendingScheduleSlot: {
          startsAt: '2026-05-08T17:20:00.000Z',
          endsAt: '2026-05-08T17:40:00.000Z',
          label: '14h20',
        },
      },
      createBotSettings(),
      '553195531183',
      'clinic-1',
    )

    expect(choosePatientResponse.nextState).toBe('agendar_alterar_paciente')
    expect(choosePatientResponse.message).toContain('nome completo do paciente')

    const patientNameResponse = await handleBotTurn(
      'conv-1',
      'Maria Eduarda',
      'agendar_alterar_paciente',
      choosePatientResponse.nextContext,
      createBotSettings(),
      '553195531183',
      'clinic-1',
    )

    expect(patientNameResponse.nextState).toBe('agendar_cpf')
    expect(patientNameResponse.message).toContain('Agora preciso do seu *CPF*')
    expect(patientNameResponse.nextContext.patientName).toBe('Maria Eduarda')
    expect(patientNameResponse.nextContext.patientCpf).toBeUndefined()
    expect(patientNameResponse.nextContext.pendingScheduleSlot?.label).toBe('14h20')
  })

  it('forces a new day and time choice when the patient selects the date option', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '1',
      'agendar_alterar_campo',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        patientCpf: '17831187685',
        selectedDay: '2026-05-08',
        selectedDayLabel: 'Sexta-feira, 08/05',
        pendingScheduleSlot: {
          startsAt: '2026-05-08T17:20:00.000Z',
          endsAt: '2026-05-08T17:40:00.000Z',
          label: '14h20',
        },
      },
      createBotSettings(),
      '553195531183',
      'clinic-1',
    )

    expect(getAvailableDaysMock).toHaveBeenCalled()
    expect(response.nextState).toBe('agendar_dia_lista')
    expect(response.message).toContain('Escolha o dia da consulta')
    expect(response.nextContext.pendingScheduleSlot).toBeUndefined()
  })

  it('returns to menu when the menu option is selected in a dynamic appointment list', async () => {
    const response = await handleBotTurn(
      'conv-1',
      '3',
      'cancelar_qual',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        appointments: [
          {
            id: 'apt-1',
            startsAt: '2026-05-08T17:20:00.000Z',
            label: 'Sexta-feira, 08/05 às 14h20',
            status: 'scheduled',
          },
          {
            id: 'apt-2',
            startsAt: '2026-05-09T17:20:00.000Z',
            label: 'Sábado, 09/05 às 14h20',
            status: 'scheduled',
          },
        ],
      },
      null,
      '553195531183',
      'clinic-1',
    )

    expect(response.nextState).toBe('menu')
    expect(response.message).toContain('Como posso te ajudar')
  })

  it('includes menu instructions in free-text steps', async () => {
    const response = await handleBotTurn(
      'conv-1',
      'Kaike',
      'agendar_nome',
      {
        patientPhone: '553195531183',
      },
      null,
      '553195531183',
      'clinic-1',
    )

    expect(response.nextState).toBe('agendar_cpf')
    expect(response.message).toContain('Digite *menu* para voltar ao menu principal')
  })

  it('matches the full day label before interpreting numbers inside dates', async () => {
    const response = await handleBotTurn(
      'conv-1',
      'Segunda-feira, 04/05',
      'agendar_dia_lista',
      {
        patientPhone: '553195531183',
        patientName: 'Kaike',
        availableDays: [
          { date: '2026-04-27', label: 'Segunda-feira, 27/04' },
          { date: '2026-04-28', label: 'Terça-feira, 28/04' },
          { date: '2026-04-29', label: 'Quarta-feira, 29/04' },
          { date: '2026-05-04', label: 'Segunda-feira, 04/05' },
        ],
        dayListOffset: 0,
        dayListHasMore: false,
      },
      createBotSettings(),
      '553195531183',
      'clinic-1',
    )

    expect(response.nextState).toBe('agendar_hora_lista')
    expect(response.nextContext.selectedDay).toBe('2026-05-04')
    expect(response.nextContext.selectedDayLabel).toBe('Segunda-feira, 04/05')
    expect(response.message).toContain('04/05')
    expect(response.message).not.toContain('29/04')
  })
})
