/**
 * Mercado Pago client configuration
 * Server-side only - never expose access token to client
 */

import { MercadoPagoConfig } from 'mercadopago'

if (!process.env.MP_ACCESS_TOKEN) {
  throw new Error('MP_ACCESS_TOKEN is not set in environment variables')
}

export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
})
