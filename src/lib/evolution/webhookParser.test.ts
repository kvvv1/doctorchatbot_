import { describe, expect, it } from 'vitest'
import { parseWebhookPayload } from '@/lib/evolution/webhookParser'

describe('parseWebhookPayload (Evolution)', () => {
  it('prefers Baileys PN alternate jid over privacy LID remoteJid', () => {
    const parsed = parseWebhookPayload({
      event: 'messages.upsert',
      instance: 'TESTE',
      apikey: 'hash',
      data: {
        key: {
          remoteJid: '272455595733154@lid',
          remoteJidAlt: '553195531183@s.whatsapp.net',
          fromMe: false,
          id: 'msg-1',
        },
        pushName: 'Paciente',
        message: {
          conversation: 'oi',
        },
        messageTimestamp: 1777423466,
      },
    })

    expect(parsed.phone).toBe('553195531183')
    expect(parsed.messageText).toBe('oi')
  })

  it('rejects LID-only payloads instead of returning a non-messageable phone', () => {
    expect(() =>
      parseWebhookPayload({
        event: 'messages.upsert',
        instance: 'TESTE',
        data: {
          key: {
            remoteJid: '272455595733154@lid',
            fromMe: false,
            id: 'msg-2',
          },
          message: {
            conversation: 'oi',
          },
        },
      }),
    ).toThrow('Missing or invalid phone')
  })
})
