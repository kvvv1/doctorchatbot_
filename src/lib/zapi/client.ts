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

export type ZapiStatus = 'connected' | 'disconnected' | 'connecting';

interface ZapiError {
  error: string;
  message?: string;
}

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

    const data = await response.json();

    if (!response.ok) {
      console.error('[Z-API] Request failed:', {
        status: response.status,
        data,
      });
      throw new Error(data.message || 'Z-API request failed');
    }

    return data;
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

  try {
    // TODO: Verificar o endpoint correto na doc Z-API
    // Opções comuns:
    // - GET /qr-code
    // - GET /qr-code/image
    // - POST /connect
    const url = `${baseUrl}/qr-code`;

    const data = await zapiRequest<any>(url, {
      method: 'GET',
      headers: clientToken
        ? { 'Client-Token': clientToken }
        : undefined,
    });

    // Log the full response to understand the structure
    console.log('[Z-API] QR Code response:', JSON.stringify(data, null, 2));

    // TODO: Ajustar mapeamento conforme resposta real da Z-API
    // A resposta pode variar:
    // - { qrcode: "base64string" }
    // - { value: "text", image: "base64" }
    // - { qr: "text" }
    
    if (data.qrcode || data.image) {
      return {
        type: 'base64',
        value: data.qrcode || data.image,
      };
    }

    if (data.value || data.qr) {
      return {
        type: 'text',
        value: data.value || data.qr,
      };
    }

    console.error('[Z-API] QR code not found. Response keys:', Object.keys(data));
    throw new Error('QR code not found in response');
  } catch (error) {
    console.error('[Z-API] Failed to get QR code:', error);
    throw new Error('Falha ao obter QR Code. Verifique a configuração da instância.');
  }
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

    const data = await zapiRequest<any>(url, {
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
    } catch (error) {
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

    const data = await zapiRequest<any>(url, {
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
    const messageId = data.messageId || data.id || data.zaapId;

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
 * Verifica se as credenciais estão válidas
 */
export function validateCredentials(credentials: ZapiCredentials): boolean {
  return !!(
    credentials.instanceId &&
    credentials.token &&
    credentials.instanceId.trim() !== '' &&
    credentials.token.trim() !== ''
  );
}
