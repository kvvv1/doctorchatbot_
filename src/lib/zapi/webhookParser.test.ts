import { describe, expect, it } from 'vitest'
import { parseWebhookPayload } from '@/lib/zapi/webhookParser'

describe('parseWebhookPayload', () => {
  it('deduplicates repeated interactive list labels in text payloads', () => {
    const parsed = parseWebhookPayload({
      instanceId: 'instance-1',
      phone: '5511999999999',
      messageId: 'msg-1',
      text: {
        message: 'Ver agendamentos\nVer agendamentos',
      },
      selectedRowId: '2',
      selectedDisplayText: 'Ver agendamentos',
    })

    expect(parsed.messageText).toBe('Ver agendamentos')
    expect(parsed.normalizedText).toBe('Ver agendamentos')
  })

  it('prefers interactive label text over semantic ids for bot processing', () => {
    const parsed = parseWebhookPayload({
      instanceId: 'instance-1',
      phone: '5511999999999',
      messageId: 'msg-2',
      selectedId: 'view_appointments',
      selectedDisplayText: 'Ver agendamentos',
      body: 'Como posso ajudar?',
    })

    expect(parsed.messageText).toBe('Ver agendamentos')
    expect(parsed.normalizedText).toBe('Ver agendamentos')
  })

  it('preserves numeric interactive ids when Z-API only sends the prompt body back', () => {
    const parsed = parseWebhookPayload({
      instanceId: 'instance-1',
      phone: '5511999999999',
      messageId: 'msg-3',
      selectedButtonId: '2',
      body: 'Não encontrei horários disponíveis nos próximos dias.\n\nDeseja falar com nossa equipe?',
    })

    expect(parsed.messageText).toBe('Não encontrei horários disponíveis nos próximos dias.\nDeseja falar com nossa equipe?')
    expect(parsed.normalizedText).toBe('2')
  })

  it('uses the selected label when button id is technical', () => {
    const parsed = parseWebhookPayload({
      instanceId: 'instance-1',
      phone: '5511999999999',
      messageId: 'msg-5',
      selectedButtonId: 'option_1',
      selectedDisplayText: 'Sim, falar com atendente',
    })

    expect(parsed.messageText).toBe('Sim, falar com atendente')
    expect(parsed.normalizedText).toBe('Sim, falar com atendente')
  })

  it('keeps plain text messages unchanged', () => {
    const parsed = parseWebhookPayload({
      instanceId: 'instance-1',
      phone: '5511999999999',
      messageId: 'msg-4',
      body: 'Oi, tudo bem?',
    })

    expect(parsed.messageText).toBe('Oi, tudo bem?')
    expect(parsed.normalizedText).toBe('Oi, tudo bem?')
  })
})
