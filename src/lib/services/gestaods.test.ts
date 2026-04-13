import { describe, expect, it, vi } from 'vitest'
import { GestaoDSService, GestaoDSServiceHelpers } from '@/lib/services/gestaods'

describe('GestaoDSServiceHelpers', () => {
  it('extracts appointment id from top-level fields', () => {
    expect(GestaoDSServiceHelpers.extractAppointmentId({ id: 12345 })).toBe('12345')
    expect(GestaoDSServiceHelpers.extractAppointmentId({ token: 'abc-token' })).toBe('abc-token')
    expect(GestaoDSServiceHelpers.extractAppointmentId({ agendamento: 'a-1' })).toBe('a-1')
  })

  it('extracts appointment id from nested data object', () => {
    const payload = { data: { appointment_id: 'ignored', token: 'nested-token-1' } }
    expect(GestaoDSServiceHelpers.extractAppointmentId(payload)).toBe('nested-token-1')
  })

  it('returns null when payload has no usable id', () => {
    expect(GestaoDSServiceHelpers.extractAppointmentId({ ok: true })).toBeNull()
    expect(GestaoDSServiceHelpers.extractAppointmentId(null)).toBeNull()
  })
})

describe('GestaoDSService high-level methods', () => {
  it('healthCheck succeeds when available times endpoint succeeds', async () => {
    const service = new GestaoDSService('token', true)
    vi.spyOn(service, 'getAvailableTimes').mockResolvedValue({ success: true, data: [] })

    const result = await service.healthCheck()

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ ok: true })
  })

  it('cancelAppointment delegates to updateAppointmentStatus with cancel fields', async () => {
    const service = new GestaoDSService('token', true)
    const spy = vi
      .spyOn(service, 'updateAppointmentStatus')
      .mockResolvedValue({ success: true, data: { canceled: true } })

    const result = await service.cancelAppointment('apt-1', 'motivo x')

    expect(result.success).toBe(true)
    expect(spy).toHaveBeenCalledWith({
      agendamento: 'apt-1',
      cancelado: true,
      motivo_cancelamento: 'motivo x',
    })
  })

  it('rescheduleAppointment cancels previous and books a new one', async () => {
    const service = new GestaoDSService('token', true)

    vi.spyOn(service, 'cancelAppointment').mockResolvedValue({ success: true, data: { ok: true } })
    vi.spyOn(service, 'bookAppointment').mockResolvedValue({
      success: true,
      data: { token: 'new-apt-token' },
    })

    const result = await service.rescheduleAppointment({
      currentAppointmentId: 'old-apt-token',
      cpf: '12345678901',
      newStartDate: '05/04/2026 10:00:00',
      newEndDate: '05/04/2026 10:30:00',
      reason: 'Remarcado teste',
      primeiroAtendimento: false,
    })

    expect(result.success).toBe(true)
    expect(result.data?.newAppointmentId).toBe('new-apt-token')
  })
})
