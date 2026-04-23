import { describe, expect, it } from 'vitest'
import {
  mergeExternalStatus,
  resolveDeliveryStatusFromExternalStatus,
  resolveReconciliationState,
} from '@/lib/services/messageReconciliationService'

describe('messageReconciliationService', () => {
  it('preserves the strongest external status during merge', () => {
    expect(mergeExternalStatus('pending', 'sent')).toBe('sent')
    expect(mergeExternalStatus('sent', 'pending')).toBe('sent')
    expect(mergeExternalStatus('delivered', 'read')).toBe('read')
    expect(mergeExternalStatus('read', 'failed')).toBe('failed')
  })

  it('maps external status to delivery status for outbound messages', () => {
    expect(resolveDeliveryStatusFromExternalStatus('pending', 'human')).toBe('sending')
    expect(resolveDeliveryStatusFromExternalStatus('sent', 'human')).toBe('sent')
    expect(resolveDeliveryStatusFromExternalStatus('delivered', 'human')).toBe('delivered')
    expect(resolveDeliveryStatusFromExternalStatus('read', 'bot')).toBe('read')
    expect(resolveDeliveryStatusFromExternalStatus('failed', 'human')).toBe('failed')
  })

  it('keeps inbound patient messages as received regardless of external status', () => {
    expect(resolveDeliveryStatusFromExternalStatus('received', 'patient')).toBe('received')
    expect(resolveDeliveryStatusFromExternalStatus('pending', 'patient')).toBe('received')
  })

  it('marks conversations as degraded when old pending messages exist', () => {
    expect(
      resolveReconciliationState({
        pendingOldCount: 1,
        remoteLastMessageAt: null,
        localLastMessageAt: null,
      }),
    ).toBe('degraded')
  })

  it('marks conversations as needing reconcile when local and remote last message times diverge', () => {
    expect(
      resolveReconciliationState({
        pendingOldCount: 0,
        localLastMessageAt: '2026-04-23T20:00:00.000Z',
        remoteLastMessageAt: '2026-04-23T20:05:00.000Z',
      }),
    ).toBe('needs_reconcile')
  })

  it('keeps conversations healthy when there is no pending debt or timing divergence', () => {
    expect(
      resolveReconciliationState({
        pendingOldCount: 0,
        localLastMessageAt: '2026-04-23T20:00:00.000Z',
        remoteLastMessageAt: '2026-04-23T20:01:00.000Z',
      }),
    ).toBe('healthy')
  })
})
