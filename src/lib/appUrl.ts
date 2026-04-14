function normalizeBaseUrl(value: string | undefined, assumeHttps = false): string | null {
  if (!value) return null

  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return assumeHttps ? `https://${trimmed}` : null
}

export function getInternalAppBaseUrl(): string {
  const vercelUrl = normalizeBaseUrl(process.env.VERCEL_URL, true)
  if (vercelUrl) return vercelUrl

  const configuredUrl =
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL)

  return configuredUrl || 'http://localhost:3000'
}
