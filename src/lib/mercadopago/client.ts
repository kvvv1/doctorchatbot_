/**
 * Mercado Pago client configuration
 * Server-side only - never expose access token to client
 */

import { MercadoPagoConfig } from 'mercadopago'

export function getMpClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('MP_ACCESS_TOKEN is not set in environment variables')
  }

  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  })
}
