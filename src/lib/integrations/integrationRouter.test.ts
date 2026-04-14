import { beforeEach, describe, expect, it, vi } from 'vitest'

const bookAppointmentMock = vi.fn()
const cancelAppointmentMock = vi.fn()
const rescheduleAppointmentMock = vi.fn()
const formatDateForApiMock = vi.fn()
const getAppointmentByIdMock = vi.fn()

vi.mock('@/lib/services/gestaods', () => ({
  GestaoDSService: class {
    bookAppointment = bookAppointmentMock
    cancelAppointment = cancelAppointmentMock
    rescheduleAppointment = rescheduleAppointmentMock
    formatDateForApi = formatDateForApiMock
    getAppointmentById = getAppointmentByIdMock
  },
  GestaoDSServiceHelpers: {
    extractAppointmentId: (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return null
      const source = payload as Record<string, unknown>
      const candidate = source.token || source.id || source.agendamento
      return candidate ? String(candidate) : null
    },
    extractPatientCpf: (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return null
      const source = payload as Record<string, unknown>
      const nested =
        source.data && typeof source.data === 'object'
          ? (source.data as Record<string, unknown>)
          : null
      const patient =
        source.paciente && typeof source.paciente === 'object'
          ? (source.paciente as Record<string, unknown>)
          : nested?.paciente && typeof nested.paciente === 'object'
            ? (nested.paciente as Record<string, unknown>)
            : null
      const candidate = source.cpf || source.paciente_cpf || nested?.cpf || nested?.paciente_cpf || patient?.cpf
      if (!candidate) return null
      const digits = String(candidate).replace(/\D/g, '')
      return digits.length === 11 ? digits : null
    },
  },
}))

vi.mock('@/lib/calendar/googleCalendar', () => ({
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}))

import {
  cancelExternalAppointment,
  createExternalAppointment,
  updateExternalAppointment,
} from '@/lib/integrations/integrationRouter'

type QueryResult = { data: unknown; error: unknown }

class QueryMock {
  private readonly result: QueryResult

  constructor(result: QueryResult) {
    this.result = result
  }

  select() {
    return this
  }

  eq() {
    return this
  }

  in() {
    return this
  }

  not() {
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  async maybeSingle() {
    return this.result
  }

  then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

function createSupabaseMock(scenarios: Record<string, QueryResult>) {
  return {
    from: (table: string) => {
      const key = Object.keys(scenarios).find((k) => k.startsWith(`${table}:`))
      if (!key) {
        return new QueryMock({ data: null, error: null })
      }

      const result = scenarios[key]
      delete scenarios[key]
      return new QueryMock(result)
    },
  } as unknown as {
    from: (table: string) => QueryMock
  }
}

describe('integrationRouter - GestaoDS paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    formatDateForApiMock.mockImplementation(async (date: Date) => date.toISOString())
  })

  it('creates external appointment in GestaoDS when cpf and integration are present', async () => {
    const supabase = createSupabaseMock({
      'clinic_integrations:list': {
        data: [
          {
            provider: 'gestaods',
            is_connected: true,
            gestaods_api_token: 'api-token',
            gestaods_is_dev: true,
          },
        ],
        error: null,
      },
      'conversations:cpf-by-id': {
        data: { cpf: '123.456.789-01' },
        error: null,
      },
    })

    bookAppointmentMock.mockResolvedValue({
      success: true,
      data: { token: 'gestaods-apt-1' },
    })

    const result = await createExternalAppointment({
      supabase,
      clinicId: 'clinic-1',
      patientName: 'Paciente Teste',
      patientPhone: '5511999999999',
      startsAt: new Date('2026-04-06T10:00:00.000Z'),
      endsAt: new Date('2026-04-06T10:30:00.000Z'),
      conversationId: 'conv-1',
    })

    expect(result.synced).toBe(true)
    expect(result.provider).toBe('gestaods')
    expect(result.providerReferenceId).toBe('gestaods-apt-1')
  })

  it('returns error when cpf is missing for GestaoDS creation', async () => {
    const supabase = createSupabaseMock({
      'clinic_integrations:list': {
        data: [
          {
            provider: 'gestaods',
            is_connected: true,
            gestaods_api_token: 'api-token',
            gestaods_is_dev: true,
          },
        ],
        error: null,
      },
      'conversations:cpf-by-id': { data: null, error: null },
      'conversations:cpf-by-phone': { data: null, error: null },
    })

    const result = await createExternalAppointment({
      supabase,
      clinicId: 'clinic-1',
      patientName: 'Paciente Teste',
      patientPhone: '5511999999999',
      startsAt: new Date('2026-04-06T10:00:00.000Z'),
      endsAt: new Date('2026-04-06T10:30:00.000Z'),
      conversationId: 'conv-1',
    })

    expect(result.synced).toBe(false)
    expect(result.error).toContain('CPF')
  })

  it('reschedules GestaoDS appointment and returns new external id', async () => {
    const supabase = createSupabaseMock({
      'clinic_integrations:list': {
        data: [
          {
            provider: 'gestaods',
            is_connected: true,
            gestaods_api_token: 'api-token',
            gestaods_is_dev: true,
          },
        ],
        error: null,
      },
      'conversations:cpf-by-phone': {
        data: { cpf: '12345678901' },
        error: null,
      },
    })

    rescheduleAppointmentMock.mockResolvedValue({
      success: true,
      data: { newAppointmentId: 'gestaods-apt-2' },
    })

    const result = await updateExternalAppointment({
      supabase,
      clinicId: 'clinic-1',
      provider: 'gestaods',
      providerReferenceId: 'gestaods-apt-1',
      patientName: 'Paciente Teste',
      patientPhone: '5511999999999',
      startsAt: new Date('2026-04-06T11:00:00.000Z'),
      endsAt: new Date('2026-04-06T11:30:00.000Z'),
      description: 'Remarcação',
    })

    expect(result.synced).toBe(true)
    expect(result.providerReferenceId).toBe('gestaods-apt-2')
  })

  it('reschedules GestaoDS appointment using appointment details when cpf is not stored locally', async () => {
    const supabase = createSupabaseMock({
      'clinic_integrations:list': {
        data: [
          {
            provider: 'gestaods',
            is_connected: true,
            gestaods_api_token: 'api-token',
            gestaods_is_dev: true,
          },
        ],
        error: null,
      },
      'conversations:cpf-by-phone': {
        data: null,
        error: null,
      },
    })

    getAppointmentByIdMock.mockResolvedValue({
      success: true,
      data: { paciente: { cpf: '123.456.789-01' } },
    })

    rescheduleAppointmentMock.mockResolvedValue({
      success: true,
      data: { newAppointmentId: 'gestaods-apt-2' },
    })

    const result = await updateExternalAppointment({
      supabase,
      clinicId: 'clinic-1',
      provider: 'gestaods',
      providerReferenceId: 'gestaods-apt-1',
      patientName: 'Paciente Teste',
      patientPhone: '5511999999999',
      startsAt: new Date('2026-04-06T11:00:00.000Z'),
      endsAt: new Date('2026-04-06T11:30:00.000Z'),
      description: 'Remarcação',
    })

    expect(getAppointmentByIdMock).toHaveBeenCalledWith('gestaods-apt-1')
    expect(result.synced).toBe(true)
    expect(result.providerReferenceId).toBe('gestaods-apt-2')
  })

  it('cancels GestaoDS appointment using external reference id', async () => {
    const supabase = createSupabaseMock({
      'clinic_integrations:list': {
        data: [
          {
            provider: 'gestaods',
            is_connected: true,
            gestaods_api_token: 'api-token',
            gestaods_is_dev: true,
          },
        ],
        error: null,
      },
    })

    cancelAppointmentMock.mockResolvedValue({ success: true, data: { ok: true } })

    const result = await cancelExternalAppointment({
      supabase,
      clinicId: 'clinic-1',
      provider: 'gestaods',
      providerReferenceId: 'gestaods-apt-1',
    })

    expect(result.synced).toBe(true)
    expect(cancelAppointmentMock).toHaveBeenCalledWith(
      'gestaods-apt-1',
      'Cancelado via Doctor Chat Bot'
    )
  })
})
