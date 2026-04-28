/**
 * Provider-agnostic WhatsApp send dispatcher.
 *
 * Routes to Z-API or Evolution API based on the `provider` field stored in
 * the `whatsapp_instances` row for the clinic.
 *
 * Both provider modules export the same function signatures, so this file is
 * purely a router — no business logic lives here.
 */

import type { ZapiCredentials, ZapiChoiceOption } from '@/lib/zapi/client'

export type WhatsAppProvider = 'zapi' | 'evolution'

export interface WhatsAppCredentials extends ZapiCredentials {
  provider: WhatsAppProvider
}

// Lazy imports to avoid bundling both providers unconditionally.
async function getClient(provider: WhatsAppProvider) {
  if (provider === 'evolution') {
    return import('@/lib/evolution/client')
  }
  return import('@/lib/zapi/client')
}

export async function sendText(
  credentials: WhatsAppCredentials,
  phone: string,
  text: string,
): Promise<{ success: boolean; messageId?: string }> {
  const client = await getClient(credentials.provider)
  return client.zapiSendText(credentials, phone, text)
}

export async function sendChoices(
  credentials: WhatsAppCredentials,
  phone: string,
  message: string,
  options: ZapiChoiceOption[],
  title?: string,
): Promise<{ success: boolean; messageId?: string; mode: 'buttons' | 'list' }> {
  const client = await getClient(credentials.provider)
  return client.zapiSendChoices(credentials, phone, message, options, title)
}

export async function getStatus(credentials: WhatsAppCredentials) {
  const client = await getClient(credentials.provider)
  return client.zapiGetStatus(credentials)
}

export async function getQr(credentials: WhatsAppCredentials) {
  const client = await getClient(credentials.provider)
  return client.zapiGetQr(credentials)
}

export async function reconnect(credentials: WhatsAppCredentials) {
  const client = await getClient(credentials.provider)
  return client.zapiReconnect(credentials)
}

export async function readMessage(
  credentials: WhatsAppCredentials,
  params: { phone: string; messageId: string },
) {
  const client = await getClient(credentials.provider)
  return client.zapiReadMessage(credentials, params)
}

export async function getChats(credentials: WhatsAppCredentials) {
  const client = await getClient(credentials.provider)
  return client.zapiGetChats(credentials)
}

export async function getProfilePicture(credentials: WhatsAppCredentials, phone: string) {
  const client = await getClient(credentials.provider)
  return client.zapiGetProfilePicture(credentials, phone)
}

export async function updateWebhookReceived(
  credentials: WhatsAppCredentials,
  webhookUrl: string,
) {
  const client = await getClient(credentials.provider)
  return client.zapiUpdateWebhookReceived(credentials, webhookUrl)
}

export function isValidProvider(value: unknown): value is WhatsAppProvider {
  return value === 'zapi' || value === 'evolution'
}
