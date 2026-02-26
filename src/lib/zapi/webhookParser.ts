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
  messageId: string | null
  timestamp: Date
  isFromMe: boolean
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
  message?: string // another alternative
  [key: string]: any
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

  // Extract message text
  const messageText = extractMessageText(payload)

  // Extract sender name
  const name = extractSenderName(payload)

  // Extract message ID
  const messageId = payload.messageId || null

  // Extract timestamp
  const timestamp = extractTimestamp(payload)

  return {
    instanceId,
    token,
    phone,
    name,
    messageText,
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
function extractMessageText(payload: ZapiWebhookPayload): string {
  // Try different possible locations for message text
  if (payload.text && typeof payload.text === 'object' && payload.text.message) {
    return String(payload.text.message).trim()
  }

  if (payload.body && typeof payload.body === 'string') {
    return payload.body.trim()
  }

  if (payload.message && typeof payload.message === 'string') {
    return payload.message.trim()
  }

  // If no text found, check if it's a media message
  if (payload.image) {
    return '[Imagem]'
  }

  if (payload.audio) {
    return '[Áudio]'
  }

  if (payload.video) {
    return '[Vídeo]'
  }

  if (payload.document) {
    return '[Documento]'
  }

  if (payload.location) {
    return '[Localização]'
  }

  if (payload.contact) {
    return '[Contato]'
  }

  // Default fallback
  return '[Mensagem sem texto]'
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
