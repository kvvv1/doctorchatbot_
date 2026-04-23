/**
 * Z-API Client (Plugável)
 * 
 * Este módulo encapsula toda a comunicação com a Z-API.
 * Os endpoints reais devem ser ajustados conforme a documentação oficial.
 * 
 * Documentação Z-API: https://developer.z-api.io/
 */

// Tipos
export interface ZapiCredentials {
  instanceId: string;
  token: string;
  clientToken?: string;
}

export interface ZapiQrResponse {
  type: 'base64' | 'text';
  value: string;
}

export interface ZapiChoiceOption {
  id: string;
  label: string;
}

export interface ZapiChat {
  id: string;
  phone: string | null;
  name: string | null;
  unreadCount: number;
  lastMessageTime: string | null;
  raw: Record<string, unknown>;
}

export type ZapiStatus = 'connected' | 'disconnected' | 'connecting';

type ZapiMethod = 'GET' | 'POST' | 'PUT';

// Configuração
const ZAPI_BASE_URL = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';

/**
 * Monta a URL base para uma instância específica
 */
function getInstanceUrl(instanceId: string, token: string): string {
  // TODO: Ajustar formato da URL conforme doc Z-API
  // Exemplo comum: https://api.z-api.io/instances/{instanceId}/token/{token}
  return `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}`;
}

/**
 * Faz uma requisição para a Z-API
 */
async function zapiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();

    let data: unknown = null;
    if (rawBody.length > 0) {
      if (contentType.includes('application/json')) {
        data = JSON.parse(rawBody);
      } else {
        try {
          data = JSON.parse(rawBody);
        } catch {
          data = rawBody;
        }
      }
    }

    if (!response.ok) {
      console.error('[Z-API] Request failed:', {
        status: response.status,
        data,
        url,
      });
      const message =
        (isRecord(data) && (toNonEmptyString(data.message) || toNonEmptyString(data.error))) ||
        (typeof data === 'string' && data.trim().length > 0 ? data : null) ||
        'Z-API request failed';
      throw new Error(message);
    }

    return data as T;
  } catch (error) {
    console.error('[Z-API] Request error:', error);
    throw error;
  }
}

/**
 * Obtém o QR Code para conectar a instância
 * 
 * TODO: Ajustar endpoint conforme documentação Z-API
 * Endpoint esperado: GET /qr-code ou similar
 */
export async function zapiGetQr(
  credentials: ZapiCredentials
): Promise<ZapiQrResponse> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  const headers = clientToken
    ? {
        'Client-Token': clientToken,
        'client-token': clientToken,
      }
    : undefined;

  const attempts: Array<{ method: ZapiMethod; path: string }> = [
    { method: 'GET', path: '/qr-code' },
    { method: 'GET', path: '/qr-code/image' },
    { method: 'GET', path: '/qr-code/base64' },
    { method: 'POST', path: '/connect' },
    { method: 'POST', path: '/restart' },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    const url = `${baseUrl}${attempt.path}`;

    try {
      const data = await zapiRequest<unknown>(url, {
        method: attempt.method,
        headers,
      });

      const parsed = extractQrFromResponse(data);
      if (parsed) {
        return parsed;
      }

      errors.push(`${attempt.method} ${attempt.path}: resposta sem QR`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.method} ${attempt.path}: ${message}`);
    }
  }

  console.error('[Z-API] Failed to get QR code after all attempts:', errors);
  throw new Error(
    `Falha ao obter QR Code. Verifique instanceId/token/clientToken da instância. Detalhe: ${errors[0] || 'sem detalhe'}`
  );
}

function extractQrFromResponse(data: unknown): ZapiQrResponse | null {
  if (!data) return null;

  if (typeof data === 'string') {
    const raw = data.trim();
    if (!raw) return null;
    if (raw.startsWith('data:image/')) {
      return { type: 'base64', value: raw };
    }
    return { type: 'text', value: raw };
  }

  if (typeof data !== 'object') return null;

  const source = data as Record<string, unknown>;
  const nested =
    source.value && typeof source.value === 'object'
      ? (source.value as Record<string, unknown>)
      : source.qrcode && typeof source.qrcode === 'object'
      ? (source.qrcode as Record<string, unknown>)
      : null;

  const base64Candidate =
    toNonEmptyString(source.qrcode) ||
    toNonEmptyString(source.image) ||
    toNonEmptyString(source.base64) ||
    toNonEmptyString(source.qrCode) ||
    toNonEmptyString(source.code) ||
    (nested ? toNonEmptyString(nested.base64) || toNonEmptyString(nested.image) : null);

  if (base64Candidate) {
    return {
      type: base64Candidate.startsWith('data:image/') ? 'base64' : 'base64',
      value: base64Candidate,
    };
  }

  const textCandidate =
    toNonEmptyString(source.value) ||
    toNonEmptyString(source.qr) ||
    toNonEmptyString(source.qrcodeString) ||
    (nested ? toNonEmptyString(nested.value) || toNonEmptyString(nested.qr) : null);

  if (textCandidate) {
    return { type: 'text', value: textCandidate };
  }

  return null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractMessageId(data: Record<string, unknown>): string | undefined {
  return (
    toNonEmptyString(data.messageId) ||
    toNonEmptyString(data.id) ||
    toNonEmptyString(data.zaapId) ||
    undefined
  );
}

/**
 * Obtém o status atual da instância
 * 
 * TODO: Ajustar endpoint e mapeamento conforme documentação Z-API
 * Endpoint esperado: GET /status
 */
export async function zapiGetStatus(
  credentials: ZapiCredentials
): Promise<ZapiStatus> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  try {
    // TODO: Verificar o endpoint correto na doc Z-API
    // Opções comuns:
    // - GET /status
    // - GET /instance/status
    // - GET /phone-status
    const url = `${baseUrl}/status`;

    const data = await zapiRequest<Record<string, unknown>>(url, {
      method: 'GET',
      headers: clientToken
        ? { 'Client-Token': clientToken }
        : undefined,
    });

    // Log completo da resposta para debug
    console.log('[Z-API] Status response:', JSON.stringify(data, null, 2));

    // Mapear status baseado na resposta real da Z-API
    let mappedStatus: ZapiStatus;

    // Se 'connected' é boolean, usar diretamente
    if (typeof data.connected === 'boolean') {
      mappedStatus = data.connected ? 'connected' : 'disconnected';
      console.log('[Z-API] Using boolean field connected:', data.connected, '→', mappedStatus);
    } else {
      // Se é string, mapear valores conhecidos
      const statusMap: Record<string, ZapiStatus> = {
        'connected': 'connected',
        'CONNECTED': 'connected',
        'online': 'connected',
        'disconnected': 'disconnected',
        'DISCONNECTED': 'disconnected',
        'offline': 'disconnected',
        'connecting': 'connecting',
        'QRCODE': 'connecting',
        'qrcode': 'connecting',
        'OPENING': 'connecting',
        'opening': 'connecting',
      };

      const rawStatus = data.status || data.state || data.connected;
      console.log('[Z-API] Raw status value:', rawStatus);
      
      mappedStatus = statusMap[String(rawStatus)] || 'disconnected';
    }

    console.log('[Z-API] Final mapped status:', mappedStatus);
    return mappedStatus;
  } catch (error) {
    console.error('[Z-API] Failed to get status:', error);
    // Em caso de erro, retornar disconnected para não travar o app
    return 'disconnected';
  }
}

/**
 * Reconecta a instância (força desconexão e geração de novo QR)
 * 
 * TODO: Ajustar endpoint conforme documentação Z-API
 * Pode ser necessário chamar um endpoint de "restart" ou "disconnect" seguido de "connect"
 */
export async function zapiReconnect(
  credentials: ZapiCredentials
): Promise<ZapiQrResponse> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  try {
    // TODO: Verificar se existe endpoint de restart/reconnect na Z-API
    // Opções comuns:
    // - POST /restart
    // - POST /disconnect seguido de GET /qr-code
    // - DELETE /session seguido de GET /qr-code

    // Por enquanto, tentamos desconectar (se existir endpoint)
    try {
      const disconnectUrl = `${baseUrl}/disconnect`;
      await zapiRequest(disconnectUrl, {
        method: 'POST',
        headers: clientToken
          ? { 'Client-Token': clientToken }
          : undefined,
      });
    } catch {
      // Ignorar erro de disconnect, pode não existir
      console.warn('[Z-API] Disconnect endpoint not available or failed');
    }

    // Aguardar um momento antes de gerar novo QR
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Gerar novo QR
    return await zapiGetQr(credentials);
  } catch (error) {
    console.error('[Z-API] Failed to reconnect:', error);
    throw new Error('Falha ao reconectar. Tente novamente.');
  }
}

/**
 * Envia uma mensagem de texto via Z-API
 * 
 * Endpoint esperado: POST /send-text
 * Docs: https://developer.z-api.io/message/send-message-text
 */
export async function zapiSendText(
  credentials: ZapiCredentials,
  phone: string,
  text: string
): Promise<{ success: boolean; messageId?: string }> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  try {
    // TODO: Ajustar endpoint conforme documentação Z-API
    // Opções comuns:
    // - POST /send-text
    // - POST /send-message
    // - POST /messages/text
    const url = `${baseUrl}/send-text`;

    // Formato do telefone:
    // Z-API geralmente espera: "5511999999999" (sem + e sem formatação)
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const payload = {
      phone: cleanPhone,
      message: text,
    };

    console.log('[Z-API] Sending text message:', {
      url,
      phone: cleanPhone,
      textLength: text.length,
    });

    const data = await zapiRequest<Record<string, unknown>>(url, {
      method: 'POST',
      headers: clientToken
        ? { 'Client-Token': clientToken }
        : undefined,
      body: JSON.stringify(payload),
    });

    console.log('[Z-API] Message sent successfully:', data);

    // TODO: Ajustar mapeamento conforme resposta real da Z-API
    // Possíveis formatos:
    // - { messageId: "..." }
    // - { id: "...", success: true }
    // - { zaapId: "..." }
    const messageId = extractMessageId(data);

    return {
      success: true,
      messageId,
    };
  } catch (error) {
    console.error('[Z-API] Failed to send text message:', error);
    throw error;
  }
}

/**
 * Envia escolhas interativas via Z-API:
 * - poucas opções (<= 3): /send-button-list
 * - muitas opções (> 3): /send-option-list
 */
export async function zapiSendChoices(
  credentials: ZapiCredentials,
  phone: string,
  message: string,
  options: ZapiChoiceOption[],
  title = 'Opções disponíveis'
): Promise<{ success: boolean; messageId?: string; mode: 'buttons' | 'list' }> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  const cleanedOptions = options
    .map((option, idx) => ({
      id: String(option.id || idx + 1),
      label: String(option.label || '').trim(),
    }))
    .filter(option => option.label.length > 0);

  if (cleanedOptions.length === 0) {
    throw new Error('Nenhuma opção válida foi informada para envio interativo.');
  }

  const headers = clientToken
    ? { 'Client-Token': clientToken }
    : undefined;

  if (cleanedOptions.length <= 3) {
    const url = `${baseUrl}/send-button-list`;
    const payload = {
      phone: cleanPhone,
      message,
      buttonList: {
        buttons: cleanedOptions.map(option => ({
          id: option.id,
          label: option.label,
        })),
      },
    };

    const data = await zapiRequest<Record<string, unknown>>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      messageId: extractMessageId(data),
      mode: 'buttons',
    };
  }

  const url = `${baseUrl}/send-option-list`;
  const payload = {
    phone: cleanPhone,
    message,
    optionList: {
      title,
      buttonLabel: 'Ver opções',
      options: cleanedOptions.map(option => ({
        id: option.id,
        title: option.label,
      })),
    },
  };

  const data = await zapiRequest<Record<string, unknown>>(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return {
    success: true,
    messageId: extractMessageId(data),
    mode: 'list',
  };
}

export async function zapiUpdateWebhookReceived(
  credentials: ZapiCredentials,
  webhookUrl: string,
): Promise<{ success: boolean }> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  await zapiRequest(`${baseUrl}/update-webhook-received`, {
    method: 'PUT',
    headers: clientToken ? { 'Client-Token': clientToken } : undefined,
    body: JSON.stringify({
      value: webhookUrl,
    }),
  });

  return { success: true };
}

export async function zapiUpdateNotifySentByMe(
  credentials: ZapiCredentials,
  enabled: boolean,
): Promise<{ success: boolean }> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  await zapiRequest(`${baseUrl}/update-notify-sent-by-me`, {
    method: 'PUT',
    headers: clientToken ? { 'Client-Token': clientToken } : undefined,
    body: JSON.stringify({
      value: enabled,
    }),
  });

  return { success: true };
}

export async function zapiReadMessage(
  credentials: ZapiCredentials,
  params: { phone: string; messageId: string },
): Promise<{ success: boolean }> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  await zapiRequest(`${baseUrl}/read-message`, {
    method: 'POST',
    headers: clientToken ? { 'Client-Token': clientToken } : undefined,
    body: JSON.stringify({
      phone: params.phone.replace(/[^0-9]/g, ''),
      messageId: params.messageId,
    }),
  });

  return { success: true };
}

export async function zapiGetChats(
  credentials: ZapiCredentials,
): Promise<ZapiChat[]> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);

  const data = await zapiRequest<unknown>(`${baseUrl}/chats`, {
    method: 'GET',
    headers: clientToken ? { 'Client-Token': clientToken } : undefined,
  });

  return normalizeChatsResponse(data);
}

/**
 * Obtém a foto de perfil do WhatsApp de um número
 * Retorna a URL da imagem ou null se não disponível
 */
export async function zapiGetProfilePicture(
  credentials: ZapiCredentials,
  phone: string,
): Promise<string | null> {
  const { instanceId, token, clientToken } = credentials;
  const baseUrl = getInstanceUrl(instanceId, token);
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const headers = clientToken ? { 'Client-Token': clientToken } : undefined;

  try {
    const data = await zapiRequest<{ link: string }>(
      `${baseUrl}/profile-picture?phone=${cleanPhone}`,
      { method: 'GET', headers },
    );
    return data?.link ?? null;
  } catch {
    return null;
  }
}

/**
 * Verifica se as credenciais estão válidas
 */
export function validateCredentials(credentials: ZapiCredentials): boolean {
  return getMissingCredentials(credentials).length === 0;
}

export function getMissingCredentials(credentials: ZapiCredentials): string[] {
  const missing: string[] = [];

  if (!credentials.instanceId || credentials.instanceId.trim() === '') {
    missing.push('instanceId');
  }

  if (!credentials.token || credentials.token.trim() === '') {
    missing.push('token');
  }

  // clientToken é opcional — não bloquear se ausente

  return missing;
}

function normalizeChatsResponse(data: unknown): ZapiChat[] {
  if (!Array.isArray(data)) {
    if (isRecord(data) && Array.isArray(data.value)) {
      return normalizeChatsResponse(data.value);
    }

    if (isRecord(data) && Array.isArray(data.chats)) {
      return normalizeChatsResponse(data.chats);
    }

    if (isRecord(data) && Array.isArray(data.data)) {
      return normalizeChatsResponse(data.data);
    }

    return [];
  }

  return data
    .map((entry) => normalizeChatEntry(entry))
    .filter((entry): entry is ZapiChat => entry !== null);
}

function normalizeChatEntry(value: unknown): ZapiChat | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const rawId =
    toNonEmptyString(raw.id) ||
    toNonEmptyString(raw.chatId) ||
    toNonEmptyString(raw.waId) ||
    toNonEmptyString(raw.phone) ||
    toNonEmptyString(raw.jid);

  if (!rawId) return null;

  const phoneCandidate =
    toNonEmptyString(raw.phone) ||
    toNonEmptyString(raw.waId) ||
    toNonEmptyString(raw.id) ||
    toNonEmptyString(raw.chatId) ||
    toNonEmptyString(raw.jid);

  const name =
    toNonEmptyString(raw.name) ||
    toNonEmptyString(raw.chatName) ||
    toNonEmptyString(raw.shortName) ||
    null;

  const unreadCount =
    typeof raw.unreadCount === 'number'
      ? raw.unreadCount
      : typeof raw.unread === 'number'
      ? raw.unread
      : 0;

  const lastMessageTime = normalizeLastMessageTime(
    raw.lastMessageTime ?? raw.lastTime ?? raw.lastMessageDate,
  );

  return {
    id: rawId,
    phone: phoneCandidate ? phoneCandidate.replace(/[^0-9]/g, '') || null : null,
    name,
    unreadCount,
    lastMessageTime,
    raw,
  };
}

function normalizeLastMessageTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 9999999999 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) {
      return normalizeLastMessageTime(asNumber);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
