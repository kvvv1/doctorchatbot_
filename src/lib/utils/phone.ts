export function getDigitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizeBrazilianPhone(value: string | null | undefined): string | null {
  const digits = getDigitsOnly(value)

  if (!digits) return null
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2)

  return digits
}

export function getBrazilianPhoneLookupCandidates(value: string | null | undefined): string[] {
  const raw = String(value ?? '').trim()
  const digits = getDigitsOnly(raw)
  const candidates = new Set<string>()

  if (raw) {
    candidates.add(raw)
  }

  if (digits) {
    candidates.add(digits)
  }

  const normalized = normalizeBrazilianPhone(raw)
  if (normalized) {
    candidates.add(normalized)
    if (!normalized.startsWith('55')) {
      candidates.add(`55${normalized}`)
    }
  }

  return [...candidates].filter(Boolean)
}
