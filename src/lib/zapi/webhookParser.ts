/**
 * Z-API Webhook Parser
 * 
 * Normalizes different Z-API webhook payload formats into a consistent structure
 * for internal processing.
 */

export interface ParsedWebhookMessage {
  instanceId: string
  token: string | null
  phone: string
  name: string | null
  messageText: string
  normalizedText: string
  messageId: string | null
  timestamp: Date
  isFromMe: boolean
}

export type ParsedConnectionStatus = 'connected' | 'disconnected' | 'connecting'

export interface ParsedConnectionStatusWebhook {
  instanceId: string
  token: string | null
  status: ParsedConnectionStatus
}

export interface ZapiWebhookPayload {
  instanceId?: string
  instance?: string
  messageId?: string
  phone?: string
  fromMe?: boolean
  moment?: number
  momment?: number // typo in Z-API
  chatName?: string
  senderName?: string
  text?: {
    message?: string
  }
  body?: string // alternative format
  message?: any // another alternative (string or nested object, depending on Z-API webhook shape)
  [key: string]: any
}

const CONNECTION_STATUS_MAP: Record<string, ParsedConnectionStatus> = {
  connected: 'connected',
  online: 'connected',
  open: 'connected',
  opened: 'connected',
  ready: 'connected',
  disconnected: 'disconnected',
  offline: 'disconnected',
  close: 'disconnected',
  closed: 'disconnected',
  logout: 'disconnected',
  connecting: 'connecting',
  opening: 'connecting',
  qrcode: 'connecting',
  qr: 'connecting',
  pairing: 'connecting',
  pending: 'connecting',
}

/**
 * Parses a Z-API webhook payload into a normalized message structure.
 * 
 * @param payload - Raw webhook payload from Z-API
 * @returns Normalized message data
 * @throws Error if required fields are missing or invalid
 */
export function parseWebhookPayload(payload: any): ParsedWebhookMessage {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: must be an object')
  }

  // Extract instanceId (required)
  const instanceId = payload.instanceId || payload.instance
  if (!instanceId || typeof instanceId !== 'string') {
    throw new Error('Missing or invalid instanceId')
  }

  // Extract token (for authentication)
  const token = payload.token || payload.clientToken || null

  // Extract phone (required)
  const phone = normalizePhone(payload.phone)
  if (!phone) {
    throw new Error('Missing or invalid phone number')
  }

  // Check if message is from us (ignore these)
  const isFromMe = payload.fromMe === true

  // Extract message text and normalized bot input
  const { messageText, normalizedText } = extractMessageText(payload)

  // Extract sender name
  const name = extractSenderName(payload)

  // Extract timestamp first (needed for synthetic message ID below)
  const timestamp = extractTimestamp(payload)

  // Extract message ID
  // For interactive replies (button/list clicks) Z-API often omits messageId.
  // Generate a synthetic dedup key so duplicate webhook deliveries are ignored.
  let messageId: string | null = getString(payload.messageId) || null
  if (!messageId) {
    const interactiveId =
      getString(payload.selectedButtonId) ||
      getString(payload.selectedRowId) ||
      getString(payload.buttonsResponseMessage?.selectedButtonId) ||
      getString(payload.listResponseMessage?.selectedRowId) ||
      getString(payload.listResponseMessage?.singleSelectReply?.selectedRowId) ||
      getString(payload.message?.buttonsResponseMessage?.selectedButtonId) ||
      getString(payload.message?.listResponseMessage?.singleSelectReply?.selectedRowId) ||
      getString(payload.data?.buttonsResponseMessage?.selectedButtonId) ||
      getString(payload.data?.listResponseMessage?.singleSelectReply?.selectedRowId) ||
      getString(payload.buttonReply?.id) ||
      getString(payload.listReply?.id)
    if (interactiveId && phone) {
      // Round to 10-second buckets so late duplicate deliveries still match.
      const bucket = Math.floor(timestamp.getTime() / 10000)
      messageId = `interactive_${phone}_${interactiveId}_${bucket}`
    }
  }

  return {
    instanceId,
    token,
    phone,
    name,
    messageText,
    normalizedText,
    messageId,
    timestamp,
    isFromMe,
  }
}

/**
 * Normalizes phone number format.
 * Removes extra characters and ensures it's in a consistent format.
 */
function normalizePhone(phone: any): string | null {
  if (!phone || typeof phone !== 'string') {
    return null
  }

  // Remove common formatting characters
  let normalized = phone.replace(/[\s\-\(\)]/g, '')

  // Remove @ suffix if present (some Z-API formats include @c.us)
  normalized = normalized.replace(/@.*$/, '')

  // Ensure we have at least some digits
  if (!/\d{8,}/.test(normalized)) {
    return null
  }

  return normalized
}

/**
 * Extracts message text from various possible payload structures.
 */
function extractMessageText(payload: ZapiWebhookPayload): {
  messageText: string
  normalizedText: string
} {
  const interactiveReply = extractInteractiveReply(payload)
  if (interactiveReply) {
    return interactiveReply
  }

  // Try different possible locations for message text
  if (payload.text && typeof payload.text === 'object' && payload.text.message) {
    const text = dedupeRepeatedLines(String(payload.text.message))
    return { messageText: text, normalizedText: text }
  }

  if (payload.body && typeof payload.body === 'string') {
    const text = dedupeRepeatedLines(payload.body)
    return { messageText: text, normalizedText: text }
  }

  if (payload.message && typeof payload.message === 'string') {
    const text = dedupeRepeatedLines(payload.message)
    return { messageText: text, normalizedText: text }
  }

  // If no text found, check if it's a media message
  if (payload.image) {
    return { messageText: '[Imagem]', normalizedText: '[Imagem]' }
  }

  if (payload.audio) {
    return { messageText: '[Áudio]', normalizedText: '[Áudio]' }
  }

  if (payload.video) {
    return { messageText: '[Vídeo]', normalizedText: '[Vídeo]' }
  }

  if (payload.document) {
    return { messageText: '[Documento]', normalizedText: '[Documento]' }
  }

  if (payload.location) {
    return { messageText: '[Localização]', normalizedText: '[Localização]' }
  }

  if (payload.contact) {
    return { messageText: '[Contato]', normalizedText: '[Contato]' }
  }

  // Default fallback
  return { messageText: '[Mensagem sem texto]', normalizedText: '[Mensagem sem texto]' }
}

function extractInteractiveReply(payload: ZapiWebhookPayload): {
  messageText: string
  normalizedText: string
} | null {
  const candidateId =
    getString(payload.selectedId) ||
    getString(payload.selectedRowId) ||
    getString(payload.selectedButtonId) ||
    getString(payload.buttonId) ||
    getString(payload.rowId) ||
    getString(payload.listResponse?.selectedRowId) ||
    getString(payload.listResponseMessage?.selectedRowId) ||
    getString(payload.listResponseMessage?.singleSelectReply?.selectedRowId) ||
    getString(payload.message?.buttonsResponseMessage?.selectedButtonId) ||
    getString(payload.message?.listResponseMessage?.selectedRowId) ||
    getString(payload.message?.listResponseMessage?.singleSelectReply?.selectedRowId) ||
    getString(payload.data?.buttonsResponseMessage?.selectedButtonId) ||
    getString(payload.data?.listResponseMessage?.selectedRowId) ||
    getString(payload.data?.listResponseMessage?.singleSelectReply?.selectedRowId) ||
    getString(payload.buttonsResponseMessage?.selectedButtonId) ||
    getString(payload.buttonReply?.id) ||
    getString(payload.listReply?.id) ||
    getString(payload.selectedButton?.id) ||
    getString(payload.selectedRow?.id) ||
    getString(payload.data?.selectedId) ||
    getString(payload.data?.selectedRowId) ||
    getString(payload.data?.selectedButtonId) ||
    getString(payload.data?.buttonId)

  const candidateLabelText =
    getString(payload.selectedDisplayText) ||
    getString(payload.selectedText) ||
    getString(payload.selectedTitle) ||
    getString(payload.buttonText?.displayText) ||
    getString(payload.buttonReply?.title) ||
    getString(payload.listReply?.title) ||
    getString(payload.listReply?.description) ||
    getString(payload.selectedButton?.label) ||
    getString(payload.selectedButton?.title) ||
    getString(payload.selectedRow?.title) ||
    getString(payload.selectedRow?.description) ||
    getString(payload.listResponseMessage?.singleSelectReply?.selectedRowTitle) ||
    getString(payload.listResponseMessage?.singleSelectReply?.selectedRowDescription) ||
    getString(payload.listResponse?.title) ||
    getString(payload.listResponse?.description) ||
    getString(payload.listResponseMessage?.title) ||
    getString(payload.message?.buttonsResponseMessage?.selectedDisplayText) ||
    getString(payload.message?.listResponseMessage?.singleSelectReply?.selectedRowTitle) ||
    getString(payload.message?.listResponseMessage?.singleSelectReply?.selectedRowDescription) ||
    getString(payload.message?.listResponseMessage?.title) ||
    getString(payload.data?.buttonsResponseMessage?.selectedDisplayText) ||
    getString(payload.data?.listResponseMessage?.singleSelectReply?.selectedRowTitle) ||
    getString(payload.data?.listResponseMessage?.singleSelectReply?.selectedRowDescription) ||
    getString(payload.data?.listResponseMessage?.title) ||
    getString(payload.buttonsResponseMessage?.selectedDisplayText) ||
    getString(payload.data?.selectedDisplayText) ||
    getString(payload.data?.selectedText) ||
    getString(payload.data?.selectedTitle) ||
    getString(payload.data?.buttonText?.displayText)

  const candidateFallbackText =
    getString(payload.text?.message) ||
    getString(payload.body) ||
    getString(payload.message) ||
    getString(payload.message?.conversation) ||
    getString(payload.message?.text?.message) ||
    getString(payload.data?.text?.message) ||
    getString(payload.data?.body)

  if (!candidateId && !candidateLabelText && !candidateFallbackText) {
    return null
  }

  const messageText = dedupeRepeatedLines(candidateLabelText || candidateFallbackText || candidateId || '[Mensagem sem texto]')

  // Prefer human-readable label/title when available.
  // Some Z-API interactive payloads return technical IDs (e.g. "option_1")
  // that do not map to bot intents; labels keep button flows stable.
  let normalizedText = messageText

  if (candidateLabelText) {
    normalizedText = dedupeRepeatedLines(candidateLabelText)
  } else if (candidateId) {
    const idText = candidateId.trim()
    // Keep pure numeric IDs as-is ("1", "2") for menu-style choices.
    if (/^\d+$/.test(idText)) {
      normalizedText = idText
    } else {
      normalizedText = idText
    }
  }

  return {
    messageText,
    normalizedText,
  }
}

function dedupeRepeatedLines(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) {
    return value.trim()
  }

  const deduped = lines.filter((line, index) => {
    if (index === 0) return true
    return line !== lines[index - 1]
  })

  return deduped.join('\n').trim()
}

/**
 * Extracts sender name from payload.
 */
function extractSenderName(payload: ZapiWebhookPayload): string | null {
  // Try different possible locations for sender name
  const name = payload.senderName || payload.chatName

  if (name && typeof name === 'string' && name.trim()) {
    return name.trim()
  }

  return null
}

/**
 * Extracts timestamp from payload or uses current time.
 */
function extractTimestamp(payload: ZapiWebhookPayload): Date {
  // Try to get timestamp from payload
  const moment = payload.moment || payload.momment // handle typo in Z-API

  if (typeof moment === 'number' && moment > 0) {
    // Z-API typically sends timestamps in milliseconds
    return new Date(moment)
  }

  // Fallback to current time
  return new Date()
}

/**
 * Validates if a webhook payload should be processed.
 * Returns false for messages that should be ignored (e.g., our own messages).
 */
export function shouldProcessWebhook(parsed: ParsedWebhookMessage): boolean {
  // Ignore messages from ourselves
  if (parsed.isFromMe) {
    return false
  }

  // Ignore system messages or invalid phones
  if (!parsed.phone || parsed.phone.length < 8) {
    return false
  }

  return true
}

/**
 * Parses status-only webhook payloads from Z-API.
 * Returns null when payload doesn't look like a connection status event.
 */
export function parseConnectionStatusWebhook(payload: any): ParsedConnectionStatusWebhook | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const instanceId =
    getString(payload.instanceId) ||
    getString(payload.instance) ||
    getString(payload.instance_id) ||
    getString(payload.data?.instanceId)

  if (!instanceId) {
    return null
  }

  const rawStatus =
    getString(payload.connectionStatus) ||
    getString(payload.status) ||
    getString(payload.event) ||
    getString(payload.type) ||
    getString(payload.data?.connectionStatus) ||
    getString(payload.data?.status) ||
    getString(payload.value)

  const status = normalizeConnectionStatus(rawStatus)
  if (!status) {
    return null
  }

  const token =
    getString(payload.token) ||
    getString(payload.clientToken) ||
    getString(payload.data?.token) ||
    null

  // If a payload has phone/message fields, this should be handled by message flow.
  const hasMessageShape = !!(payload.phone || payload.text || payload.message || payload.body)
  if (hasMessageShape) {
    return null
  }

  return { instanceId, token, status }
}

function normalizeConnectionStatus(rawStatus: string | null): ParsedConnectionStatus | null {
  if (!rawStatus) {
    return null
  }

  const normalized = rawStatus.trim().toLowerCase()
  if (normalized in CONNECTION_STATUS_MAP) {
    return CONNECTION_STATUS_MAP[normalized]
  }

  return null
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
