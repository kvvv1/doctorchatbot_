import { describe, expect, it } from 'vitest'

import {
  getBrazilianPhoneLookupCandidates,
  normalizeBrazilianPhone,
  normalizePhoneForStorage,
} from './phone'

describe('phone helpers', () => {
  it('normalizes local brazilian numbers to storage format with country code', () => {
    expect(normalizePhoneForStorage('(11) 99876-5432')).toBe('5511998765432')
    expect(normalizePhoneForStorage('11998765432')).toBe('5511998765432')
  })

  it('keeps lookup candidates compatible with legacy rows with and without 55', () => {
    expect(getBrazilianPhoneLookupCandidates('11998765432')).toEqual(
      expect.arrayContaining(['11998765432', '5511998765432']),
    )
  })

  it('strips country code when normalizing for display/search compatibility', () => {
    expect(normalizeBrazilianPhone('5511998765432')).toBe('11998765432')
  })
})
