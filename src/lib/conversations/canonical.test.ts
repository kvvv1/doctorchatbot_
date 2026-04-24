import { describe, expect, it } from 'vitest'
import type { Conversation } from '@/lib/types/database'
import { pickCanonicalConversation } from './canonical'

function buildConversation(overrides: Partial<Conversation>): Conversation {
	return {
		id: overrides.id ?? 'conv-1',
		clinic_id: overrides.clinic_id ?? 'clinic-1',
		patient_phone: overrides.patient_phone ?? '5531999999999',
		patient_name: overrides.patient_name ?? 'Paciente',
		cpf: overrides.cpf ?? null,
		status: overrides.status ?? 'new',
		bot_enabled: overrides.bot_enabled ?? true,
		bot_state: overrides.bot_state ?? 'menu',
		bot_context: overrides.bot_context ?? {},
		notes: overrides.notes ?? null,
		profile_picture_url: overrides.profile_picture_url ?? null,
		last_message_at: overrides.last_message_at ?? null,
		last_message_preview: overrides.last_message_preview ?? null,
		last_patient_message_at: overrides.last_patient_message_at ?? null,
		last_external_message_at: overrides.last_external_message_at ?? null,
		last_reconciled_at: overrides.last_reconciled_at ?? null,
		reconciliation_state: overrides.reconciliation_state ?? 'healthy',
		unread_count: overrides.unread_count ?? 0,
		created_at: overrides.created_at ?? '2026-04-23T18:00:00.000Z',
		updated_at: overrides.updated_at ?? '2026-04-23T18:00:00.000Z',
	}
}

describe('pickCanonicalConversation', () => {
	it('prefers the most recently active conversation for the same normalized phone', () => {
		const older = buildConversation({
			id: 'older',
			patient_phone: '31999999999',
			last_message_at: '2026-04-23T18:00:00.000Z',
			updated_at: '2026-04-23T18:00:00.000Z',
		})
		const newer = buildConversation({
			id: 'newer',
			patient_phone: '5531999999999',
			last_message_at: '2026-04-23T19:00:00.000Z',
			updated_at: '2026-04-23T19:00:00.000Z',
		})

		expect(pickCanonicalConversation([older, newer], older)?.id).toBe('newer')
	})

	it('keeps the reference conversation when there is no duplicate for the same phone', () => {
		const reference = buildConversation({
			id: 'unique',
			patient_phone: '5531888888888',
		})

		expect(pickCanonicalConversation([reference], reference)?.id).toBe('unique')
	})
})
