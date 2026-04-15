import { describe, expect, it } from 'vitest'

import { hasFeatureAccess, PlanFeature } from './planFeatures'

describe('planFeatures', () => {
	it('keeps the agenda available in the essencial plan', () => {
		expect(hasFeatureAccess('essencial', PlanFeature.AGENDA)).toBe(true)
		expect(hasFeatureAccess('essencial', PlanFeature.CALENDAR_INTEGRATION)).toBe(false)
	})

	it('allows external calendar integrations only on higher tiers', () => {
		expect(hasFeatureAccess('profissional', PlanFeature.AGENDA)).toBe(true)
		expect(hasFeatureAccess('profissional', PlanFeature.CALENDAR_INTEGRATION)).toBe(true)
		expect(hasFeatureAccess('clinic_pro', PlanFeature.CALENDAR_INTEGRATION)).toBe(true)
		expect(hasFeatureAccess('fundador', PlanFeature.AGENDA)).toBe(true)
		expect(hasFeatureAccess('fundador', PlanFeature.CALENDAR_INTEGRATION)).toBe(false)
	})
})
