/**
 * Evolution API Webhook Parser
 *
 * Converts Evolution webhook payloads into the same ParsedWebhookMessage /
 * ParsedConnectionStatusWebhook shapes produced by the Z-API parser, so the
 * webhook route handler needs no changes.
 *
 * Evolution payload envelope:
 * {
 *   event: "messages.upsert" | "connection.update" | "messages.update" | ...,
 *   instance: "instance-name",
 *   data: { ... },
 *   apikey: "the-api-key"   // present when Evolution is configured to send it
 * }
 */

import { normalizePhoneForStorage } from '@/lib/utils/phone'

export type {
  ParsedWebhookMessage,
  ParsedConnectionStatus,
  ParsedConnectionStatusWebhook,
} from '@/lib/zapi/webhookParser'

import type {
  ParsedWebhookMessage,
  ParsedConnectionStatus,
  ParsedConnectionStatusWebhook,
} from '@/lib/zapi/webhookParser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolutionWebhookPayload {
  event?: string
  instance?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
  apikey?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, ParsedConnectionStatus> = {
  open: 'connected',
  connected: 'connected',
  connecting: 'connecting',
  qr: 'connecting',
  qrcode: 'connecting',
  close: 'disconnected',
  closed: 'disconnected',
  disconnected: 'disconnected',
  logout: 'disconnected',
}

export function parseConnectionStatusWebhook(
  payload: unknown,
): ParsedConnectionStatusWebhook | null {
  if (!payload || typeof payload !== 'object') return null

  const p = payload as EvolutionWebhookPayload

  // Must be a connection.update event
  if (!p.event?.startsWith('connection.')) return null

  const instanceId = str(p.instance) || str(p.data?.instance)
  if (!instanceId) return null

  const rawState =
    str(p.data?.state) ||
    str(p.data?.status) ||
    str(p.data?.connectionStatus)

  const status = rawState ? (STATUS_MAP[rawState.toLowerCase()] ?? null) : null
  if (!status) return null

  return { instanceId, token: str(p.apikey), status }
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export function parseWebhookPayload(payload: unknown): ParsedWebhookMessage {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: must be an object')
  }

  const p = payload as EvolutionWebhookPayload

  const instanceId = str(p.instance)
  if (!instanceId) throw new Error('Missing instanceId (instance field)')

  // Evolution sends apikey in the body when configured
  const token = str(p.apikey) || null

  const data = p.data || {}

  // Newer Baileys/Evolution builds can emit a privacy LID as remoteJid
  // (for example 123456789@lid). Prefer the alternate PN fields when present,
  // otherwise we may create a conversation for a non-messageable technical id.
  const rawJid = resolvePhoneJid(data, p)
  const phone = normalizePhone(rawJid)
  if (!phone) throw new Error('Missing or invalid phone (remoteJid)')

  const isFromMe = data.key?.fromMe === true

  const messageId = str(data.key?.id) || null
  const name = str(data.pushName) || null
  const timestamp = extractTimestamp(data)

  const { messageText, normalizedText } = extractText(data)
  const interactiveReplyId = extractInteractiveId(data)

  // Synthetic dedup key for interactive replies with missing messageId
  let resolvedMessageId = messageId
  if (!resolvedMessageId && interactiveReplyId && phone) {
    const bucket = Math.floor(timestamp.getTime() / 10000)
    resolvedMessageId = `interactive_${phone}_${interactiveReplyId}_${bucket}`
  }

  return {
    instanceId,
    token,
    phone,
    name,
    messageText,
    normalizedText,
    messageId: resolvedMessageId,
    interactiveReplyId,
    timestamp,
    isFromMe,
  }
}

export function shouldProcessWebhook(parsed: ParsedWebhookMessage): boolean {
  if (parsed.isFromMe) return false
  if (!parsed.phone || parsed.phone.length < 8) return false
  return true
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

function extractText(data: Record<string, unknown>): {
  messageText: string
  normalizedText: string
} {
  // 1. Try interactive reply (button / list)
  const interactive = extractInteractiveReply(data)
  if (interactive) return interactive

  // 2. Standard message types
  const msg = data.message as Record<string, unknown> | undefined

  const text =
    str(msg?.conversation) ||
    str((msg?.extendedTextMessage as Record<string, unknown>)?.text) ||
    str(msg?.text) ||
    str(data.body)

  if (text) {
    const t = dedup(text)
    return { messageText: t, normalizedText: t }
  }

  // 3. Media fallbacks
  if (msg?.imageMessage || data.messageType === 'imageMessage')
    return { messageText: '[Imagem]', normalizedText: '[Imagem]' }
  if (msg?.audioMessage || data.messageType === 'audioMessage')
    return { messageText: '[Áudio]', normalizedText: '[Áudio]' }
  if (msg?.videoMessage || data.messageType === 'videoMessage')
    return { messageText: '[Vídeo]', normalizedText: '[Vídeo]' }
  if (msg?.documentMessage || data.messageType === 'documentMessage')
    return { messageText: '[Documento]', normalizedText: '[Documento]' }
  if (msg?.locationMessage || data.messageType === 'locationMessage')
    return { messageText: '[Localização]', normalizedText: '[Localização]' }
  if (msg?.contactMessage || data.messageType === 'contactMessage')
    return { messageText: '[Contato]', normalizedText: '[Contato]' }

  return { messageText: '[Mensagem sem texto]', normalizedText: '[Mensagem sem texto]' }
}

function extractInteractiveReply(data: Record<string, unknown>): {
  messageText: string
  normalizedText: string
} | null {
  const id = extractInteractiveId(data)

  const msg = data.message as Record<string, unknown> | undefined

  const label =
    str((msg?.buttonsResponseMessage as Record<string, unknown>)?.selectedDisplayText) ||
    str((msg?.listResponseMessage as Record<string, unknown>)?.title) ||
    str(
      (
        (msg?.listResponseMessage as Record<string, unknown>)
          ?.singleSelectReply as Record<string, unknown>
      )?.selectedRowTitle,
    ) ||
    str((msg?.templateButtonReplyMessage as Record<string, unknown>)?.selectedDisplayText)

  if (!id && !label) return null

  const messageText = dedup(label || id || '[Mensagem sem texto]')

  let normalizedText = messageText
  if (label) {
    normalizedText = dedup(label)
  } else if (id) {
    normalizedText = id.trim()
  }

  return { messageText, normalizedText }
}

function extractInteractiveId(data: Record<string, unknown>): string | null {
  const msg = data.message as Record<string, unknown> | undefined

  return (
    str((msg?.buttonsResponseMessage as Record<string, unknown>)?.selectedButtonId) ||
    str(
      (
        (msg?.listResponseMessage as Record<string, unknown>)
          ?.singleSelectReply as Record<string, unknown>
      )?.selectedRowId,
    ) ||
    str((msg?.templateButtonReplyMessage as Record<string, unknown>)?.selectedId) ||
    null
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhone(jid: string | null): string | null {
  if (!jid) return null
  if (isLidJid(jid)) return null
  // Strip @s.whatsapp.net, @g.us, etc.
  const bare = jid.replace(/@.*$/, '')
  const normalized = normalizePhoneForStorage(bare)
  if (!normalized) return null

  // Avoid treating Baileys LID/random ids as WhatsApp phone numbers.
  // Brazilian patient numbers in this app are stored as 55 + DDD + number.
  if (normalized.startsWith('55') && (normalized.length === 12 || normalized.length === 13)) {
    return normalized
  }

  if (bare.length === 10 || bare.length === 11) {
    return normalized
  }

  return null
}

function resolvePhoneJid(
  data: Record<string, unknown>,
  payload: EvolutionWebhookPayload,
): string | null {
  const key = data.key as Record<string, unknown> | undefined
  const candidates = [
    key?.remoteJidAlt,
    data.remoteJidAlt,
    data.senderPn,
    key?.participantAlt,
    data.participantAlt,
    data.senderPnJid,
    data.remoteJidPn,
    key?.remoteJid,
    data.remoteJid,
    key?.participant,
    data.participant,
    data.sender,
    payload.sender,
  ]

  for (const candidate of candidates) {
    const jid = str(candidate)
    if (jid && normalizePhone(jid)) return jid
  }

  return null
}

function isLidJid(value: string): boolean {
  return /@lid(?:\b|$)/i.test(value)
}

function extractTimestamp(data: Record<string, unknown>): Date {
  const raw = data.messageTimestamp
  if (typeof raw === 'number' && raw > 0) {
    const ms = raw > 9_999_999_999 ? raw : raw * 1000
    return new Date(ms)
  }
  return new Date()
}

function dedup(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  if (lines.length <= 1) return value.trim()
  return lines.filter((l, i) => i === 0 || l !== lines[i - 1]).join('\n').trim()
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}
