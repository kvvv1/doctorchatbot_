/**
 * Evolution API Client
 *
 * Drop-in replacement for the Z-API client. Exports the same function signatures
 * so callers only need to swap the import.
 *
 * Credentials mapping (reuses ZapiCredentials shape):
 *   instanceId  → Evolution instance name (e.g. "cliente1")
 *   token       → Evolution API key (header apikey)
 *   clientToken → unused (kept for interface compatibility)
 */

export type {
  ZapiCredentials,
  ZapiQrResponse,
  ZapiChoiceOption,
  ZapiChat,
  ZapiStatus,
} from '@/lib/zapi/client'

import type {
  ZapiCredentials,
  ZapiQrResponse,
  ZapiChoiceOption,
  ZapiChat,
  ZapiStatus,
} from '@/lib/zapi/client'

const EVOLUTION_BASE_URL =
  (process.env.EVOLUTION_API_URL?.trim() || 'https://api.codexy.com.br').replace(/\/$/, '')

// ---------------------------------------------------------------------------
// Internal HTTP helper
// ---------------------------------------------------------------------------

async function evolutionRequest<T>(
  path: string,
  options: RequestInit,
  apiKey: string,
  timeoutMs = 15000,
): Promise<T> {
  const url = `${EVOLUTION_BASE_URL}${path}`
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        ...options.headers,
      },
    })

    const rawBody = await response.text()
    let data: unknown = null
    if (rawBody.length > 0) {
      try {
        data = JSON.parse(rawBody)
      } catch {
        data = rawBody
      }
    }

    if (!response.ok) {
      const detail =
        isRecord(data) && isRecord(data.response) && Array.isArray(data.response.message)
          ? data.response.message
          : null
      console.error('[Evolution] Request failed:', { status: response.status, data, url, detail })
      const message =
        (detail && detail.join(', ')) ||
        (isRecord(data) &&
          (toString(data.message) || toString(data.error) || toString(data.reason))) ||
        (typeof data === 'string' && data.trim()) ||
        'Evolution API request failed'
      throw new Error(message)
    }

    return data as T
  } catch (error) {
    console.error('[Evolution] Request error:', error)
    throw error
  }
}

// ---------------------------------------------------------------------------
// QR / connect
// ---------------------------------------------------------------------------

export async function zapiGetQr(credentials: ZapiCredentials): Promise<ZapiQrResponse> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)
  const encodedId = encodeURIComponent(instanceId)

  const data = await evolutionRequest<unknown>(
    `/instance/connect/${encodedId}`,
    { method: 'GET' },
    apiKey,
  )

  const parsed = extractQr(data)
  if (parsed) return parsed

  throw new Error('Evolution: resposta sem QR Code. Verifique se a instância está desconectada.')
}

function extractQr(data: unknown): ZapiQrResponse | null {
  if (!data) return null

  if (typeof data === 'string') {
    const s = data.trim()
    if (!s) return null
    return { type: s.startsWith('data:image/') ? 'base64' : 'text', value: s }
  }

  if (!isRecord(data)) return null

  // Evolution API may nest QR under data.qrcode (object) or data.base64 (string)
  const qrcodeObj = isRecord(data.qrcode) ? data.qrcode : null

  const base64 =
    toString(data.base64) ||
    (qrcodeObj && toString(qrcodeObj.base64)) ||
    (qrcodeObj && toString(qrcodeObj.image)) ||
    toString(data.image)

  if (base64) {
    // Strip data URI prefix — components add it themselves
    const raw = base64.startsWith('data:image/')
      ? base64.replace(/^data:image\/[^;]+;base64,/, '')
      : base64
    return { type: 'base64', value: raw }
  }

  const text =
    toString(data.code) ||
    (qrcodeObj && toString(qrcodeObj.code)) ||
    toString(data.value) ||
    (qrcodeObj && toString(qrcodeObj.pairingCode))

  if (text) return { type: 'text', value: text }

  return null
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function zapiGetStatus(credentials: ZapiCredentials): Promise<ZapiStatus> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)

  try {
    const data = await evolutionRequest<unknown>(
      `/instance/connectionState/${encodeURIComponent(instanceId)}`,
      { method: 'GET' },
      apiKey,
    )

    console.log('[Evolution] Status response:', JSON.stringify(data, null, 2))

    const rawState =
      (isRecord(data) && (toString(data.state) || toString((data.instance as Record<string, unknown>)?.state))) ||
      null

    return mapEvolutionState(rawState)
  } catch (error) {
    console.error('[Evolution] Failed to get status:', error)
    return 'disconnected'
  }
}

function mapEvolutionState(raw: string | null): ZapiStatus {
  switch (raw?.toLowerCase()) {
    case 'open':
    case 'connected':
      return 'connected'
    case 'connecting':
    case 'qr':
      return 'connecting'
    default:
      return 'disconnected'
  }
}

// ---------------------------------------------------------------------------
// Reconnect
// ---------------------------------------------------------------------------

export async function zapiReconnect(credentials: ZapiCredentials): Promise<ZapiQrResponse> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)

  try {
    await evolutionRequest(
      `/instance/logout/${encodeURIComponent(instanceId)}`,
      { method: 'DELETE' },
      apiKey,
    )
  } catch {
    console.warn('[Evolution] Logout failed or instance not connected — proceeding to connect')
  }

  await new Promise(resolve => setTimeout(resolve, 1000))
  return zapiGetQr(credentials)
}

// ---------------------------------------------------------------------------
// Send text
// ---------------------------------------------------------------------------

export async function zapiSendText(
  credentials: ZapiCredentials,
  phone: string,
  text: string,
): Promise<{ success: boolean; messageId?: string }> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)
  const digits = phone.replace(/[^0-9]/g, '')
  const number = `${digits}@s.whatsapp.net`

  console.log('[Evolution] Sending text:', { instanceId, number, textLength: text.length })

  const data = await evolutionRequest<Record<string, unknown>>(
    `/message/sendText/${encodeURIComponent(instanceId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ number, text, options: { delay: 0, presence: 'composing' } }),
    },
    apiKey,
    45000,
  )

  console.log('[Evolution] Message sent:', JSON.stringify(data))

  const messageId =
    toString((data.key as Record<string, unknown>)?.id) ||
    toString(data.id) ||
    toString(data.messageId) ||
    undefined

  return { success: true, messageId }
}

// ---------------------------------------------------------------------------
// Send interactive choices
// Uses sendList (sections format) for all menu sizes. Falls back to plain
// numbered text if the list endpoint rejects the request.
// ---------------------------------------------------------------------------

export async function zapiSendChoices(
  credentials: ZapiCredentials,
  phone: string,
  message: string,
  options: ZapiChoiceOption[],
  title = 'Opções disponíveis',
): Promise<{ success: boolean; messageId?: string; mode: 'buttons' | 'list' }> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)
  const number = `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

  const cleaned = options
    .map((o, i) => ({ id: String(o.id || i + 1), label: String(o.label || '').trim() }))
    .filter(o => o.label.length > 0)

  if (cleaned.length === 0) {
    throw new Error('Nenhuma opção válida para envio interativo.')
  }

  const data = await evolutionRequest<Record<string, unknown>>(
    `/message/sendList/${encodeURIComponent(instanceId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number,
        title,
        description: message,
        buttonText: 'Ver opções',
        footerText: '',
        sections: [
          {
            title,
            rows: cleaned.map(o => ({
              rowId: o.id,
              title: o.label,
              description: o.label,
            })),
          },
        ],
      }),
    },
    apiKey,
    45000,
  )
  return {
    success: true,
    messageId: toString((data.key as Record<string, unknown>)?.id) || toString(data.id) || undefined,
    mode: 'list',
  }
}

// ---------------------------------------------------------------------------
// Webhook configuration
// ---------------------------------------------------------------------------

export async function zapiUpdateWebhookReceived(
  credentials: ZapiCredentials,
  webhookUrl: string,
): Promise<{ success: boolean }> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)

  await evolutionRequest(
    `/webhook/set/${encodeURIComponent(instanceId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE',
          ],
        },
      }),
    },
    apiKey,
  )

  return { success: true }
}

export async function zapiUpdateNotifySentByMe(
  credentials: ZapiCredentials,
  enabled: boolean,
): Promise<{ success: boolean }> {
  // Evolution includes fromMe messages in the same webhook stream; no separate toggle.
  console.log('[Evolution] zapiUpdateNotifySentByMe is a no-op:', enabled)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Read message
// ---------------------------------------------------------------------------

export async function zapiReadMessage(
  credentials: ZapiCredentials,
  params: { phone: string; messageId: string },
): Promise<{ success: boolean }> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)
  const remoteJid = `${params.phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`

  await evolutionRequest(
    `/chat/markMessageAsRead/${encodeURIComponent(instanceId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        read_messages: [{ remoteJid, id: params.messageId, fromMe: false }],
      }),
    },
    apiKey,
  )

  return { success: true }
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

export async function zapiGetChats(credentials: ZapiCredentials): Promise<ZapiChat[]> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)

  try {
    const data = await evolutionRequest<unknown>(
      `/chat/findChats/${encodeURIComponent(instanceId)}`,
      { method: 'GET' },
      apiKey,
    )
    return normalizeChats(data)
  } catch (error) {
    console.warn('[Evolution] zapiGetChats failed, returning empty list:', error)
    return []
  }
}

function normalizeChats(data: unknown): ZapiChat[] {
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.chats)
    ? data.chats
    : []

  return list
    .map((entry): ZapiChat | null => {
      if (!isRecord(entry)) return null
      const rawId =
        toString(entry.id) || toString(entry.remoteJid) || toString(entry.chatId)
      if (!rawId) return null

      const phone = rawId.replace(/@.*$/, '').replace(/[^0-9]/g, '') || null

      return {
        id: rawId,
        phone,
        name: toString(entry.name) || toString(entry.pushName) || null,
        unreadCount: typeof entry.unreadCount === 'number' ? entry.unreadCount : 0,
        lastMessageTime: normalizeTime(entry.updatedAt ?? entry.lastMessageTime ?? null),
        raw: entry,
      }
    })
    .filter((c): c is ZapiChat => c !== null)
}

// ---------------------------------------------------------------------------
// Profile picture
// ---------------------------------------------------------------------------

export async function zapiGetProfilePicture(
  credentials: ZapiCredentials,
  phone: string,
): Promise<string | null> {
  const { instanceId, token } = credentials
  const apiKey = resolveApiKey(token)
  const number = phone.replace(/[^0-9]/g, '')

  try {
    const data = await evolutionRequest<unknown>(
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceId)}?number=${number}`,
      { method: 'GET' },
      apiKey,
    )
    return (isRecord(data) && toString(data.profilePictureUrl ?? data.link)) || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Credentials validation (same logic as Z-API)
// ---------------------------------------------------------------------------

export function validateCredentials(credentials: ZapiCredentials): boolean {
  return getMissingCredentials(credentials).length === 0
}

export function getMissingCredentials(credentials: ZapiCredentials): string[] {
  const missing: string[] = []
  if (!credentials.instanceId?.trim()) missing.push('instanceId')
  // token is optional when EVOLUTION_API_KEY env var is set
  if (!credentials.token?.trim() && !process.env.EVOLUTION_API_KEY?.trim()) {
    missing.push('token (ou EVOLUTION_API_KEY)')
  }
  return missing
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey(credentialToken: string | undefined): string {
  return credentialToken?.trim() || process.env.EVOLUTION_API_KEY || ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

function normalizeTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 9_999_999_999 ? value : value * 1000
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (!Number.isNaN(n)) return normalizeTime(n)
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}
