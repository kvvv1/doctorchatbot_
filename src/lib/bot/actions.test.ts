import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClientMock,
  listPatientAppointmentsMock,
  listAppointmentsMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  listPatientAppointmentsMock: vi.fn(),
  listAppointmentsMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock('@/lib/integrations/integrationRouter', () => ({
  cancelExternalAppointment: vi.fn(),
  createExternalAppointment: vi.fn(),
  updateExternalAppointment: vi.fn(),
}))

vi.mock('@/lib/services/gestaods', () => ({
  GestaoDSService: class {
    listAppointments = listAppointmentsMock
    listPatientAppointments = listPatientAppointmentsMock
  },
  GestaoDSServiceHelpers: {
    extractAppointmentId: (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return null
      const source = payload as Record<string, unknown>
      const candidate = source.token || source.id || source.agendamento
      return candidate ? String(candidate) : null
    },
  },
}))

import { formatSlotLabel, getPatientAppointments } from '@/lib/bot/actions'

type QueryPayload = Record<string, unknown>
type QueryResult = { data: unknown; error: unknown }

type QueryState = {
  table: string
  operation: 'select' | 'insert' | 'update'
  payload?: unknown
  filters: Array<{ type: string; column: string; value?: unknown; operator?: string }>
}

class QueryMock {
  private readonly state: QueryState
  private readonly resolver: (state: QueryState, terminal: 'then' | 'single' | 'maybeSingle') => QueryResult | Promise<QueryResult>

  constructor(
    table: string,
    resolver: (state: QueryState, terminal: 'then' | 'single' | 'maybeSingle') => QueryResult | Promise<QueryResult>
  ) {
    this.state = { table, operation: 'select', filters: [] }
    this.resolver = resolver
  }

  select() {
    return this
  }

  insert(payload: unknown) {
    this.state.operation = 'insert'
    this.state.payload = payload
    return this
  }

  update(payload: unknown) {
    this.state.operation = 'update'
    this.state.payload = payload
    return this
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ type: 'eq', column, value })
    return this
  }

  in(column: string, value: unknown) {
    this.state.filters.push({ type: 'in', column, value })
    return this
  }

  gte(column: string, value: unknown) {
    this.state.filters.push({ type: 'gte', column, value })
    return this
  }

  not(column: string, operator: string, value: unknown) {
    this.state.filters.push({ type: 'not', column, operator, value })
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  async single() {
    return this.resolver(this.state, 'single')
  }

  async maybeSingle() {
    return this.resolver(this.state, 'maybeSingle')
  }

  then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.resolver(this.state, 'then')).then(resolve, reject)
  }
}

type SupabaseLike = {
  from: (table: string) => QueryMock
}

function createSupabaseMock(
  resolver: (state: QueryState, terminal: 'then' | 'single' | 'maybeSingle') => QueryResult | Promise<QueryResult>
) : SupabaseLike {
  return {
    from: (table: string) => new QueryMock(table, resolver),
  }
}

function hasFilter(state: QueryState, column: string, value?: unknown) {
  return state.filters.some((filter) => filter.column === column && (value === undefined || filter.value === value))
}

describe('getPatientAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches GestaoDS appointments by CPF and mirrors missing appointments locally', async () => {
    const insertedPayloads: QueryPayload[] = []

    createAdminClientMock.mockReturnValue(createSupabaseMock((state, terminal) => {
      if (state.table === 'appointments' && state.operation === 'select' && terminal === 'then' && hasFilter(state, 'patient_phone', '5511999999999')) {
        return { data: [], error: null }
      }

      if (state.table === 'clinic_integrations' && terminal === 'maybeSingle') {
        return {
          data: {
            gestaods_api_token: 'api-token',
            gestaods_is_dev: true,
          },
          error: null,
        }
      }

      if (state.table === 'conversations' && terminal === 'maybeSingle') {
        return {
          data: { cpf: '123.456.789-01' },
          error: null,
        }
      }

      if (state.table === 'appointments' && state.operation === 'select' && terminal === 'maybeSingle' && hasFilter(state, 'provider_reference_id', 'apt-gds-1')) {
        return { data: null, error: null }
      }

      if (state.table === 'appointments' && state.operation === 'insert' && terminal === 'single') {
        insertedPayloads.push(state.payload as QueryPayload)
        return {
          data: { id: 'local-apt-1' },
          error: null,
        }
      }

      return { data: null, error: null }
    }))

    listPatientAppointmentsMock.mockResolvedValue({
      success: true,
      data: [
        {
          token: 'apt-gds-1',
          data_agendamento: '20/04/2026 10:00:00',
          data_fim_agendamento: '20/04/2026 10:30:00',
          confirmado: false,
          cancelado: false,
          finalizado: false,
          paciente: {
            nome: 'Paciente GestaoDS',
            celular: '11999999999',
          },
        },
      ],
    })

    const result = await getPatientAppointments('clinic-1', '5511999999999')

    expect(listPatientAppointmentsMock).toHaveBeenCalledWith('12345678901')
    expect(listAppointmentsMock).not.toHaveBeenCalled()
    expect(insertedPayloads).toHaveLength(1)
    expect(insertedPayloads[0]).toMatchObject({
      clinic_id: 'clinic-1',
      provider: 'gestaods',
      provider_reference_id: 'apt-gds-1',
      patient_name: 'Paciente GestaoDS',
      patient_phone: '11999999999',
      status: 'scheduled',
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'local-apt-1',
      startsAt: '2026-04-20T13:00:00.000Z',
      status: 'scheduled',
      label: formatSlotLabel(new Date('2026-04-20T13:00:00.000Z')),
    })
  })
})
