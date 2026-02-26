/**
 * Plans Configuration
 * Centralized pricing and features for all subscription plans
 */

export type PlanKey = 'essencial' | 'profissional' | 'clinic_pro' | 'fundador'

export interface Plan {
	key: PlanKey
	name: string
	priceBRL: number
	badge?: string
	badgeColor?: 'blue' | 'purple' | 'amber' | 'emerald'
	isRecommended?: boolean
	isFounder?: boolean
	features: string[]
	stripePriceIdEnvKey: string
	description?: string
}

export const PLANS: Record<PlanKey, Plan> = {
	essencial: {
		key: 'essencial',
		name: 'Essencial',
		priceBRL: 397,
		badge: 'Essencial',
		badgeColor: 'blue',
		stripePriceIdEnvKey: 'STRIPE_PRICE_ID_ESSENCIAL',
		description: 'Para clínicas que querem começar com automação inteligente',
		features: [
			'Chatbot inteligente com IA',
			'WhatsApp integrado via Z-API',
			'Agendamento automatizado',
			'Respostas rápidas personalizadas',
			'Dashboard de conversas',
			'Histórico completo de mensagens',
			'1 atendente simultâneo',
		],
	},
	profissional: {
		key: 'profissional',
		name: 'Profissional',
		priceBRL: 597,
		badge: 'Mais escolhido',
		badgeColor: 'purple',
		isRecommended: true,
		stripePriceIdEnvKey: 'STRIPE_PRICE_ID_PROFISSIONAL',
		description: 'Para clínicas que desejam escalar o atendimento',
		features: [
			'Tudo do Essencial',
			'Chatbot inteligente com IA',
			'Fluxos personalizados avançados',
			'Agendamento inteligente com Google Calendar',
			'Relatórios e métricas detalhadas',
			'Múltiplos atendentes simultâneos',
			'Integração completa com calendário',
			'Suporte prioritário',
			'Notificações de confirmação automáticas',
		],
	},
	clinic_pro: {
		key: 'clinic_pro',
		name: 'Clinic Pro',
		priceBRL: 997,
		badge: 'Premium',
		badgeColor: 'amber',
		stripePriceIdEnvKey: 'STRIPE_PRICE_ID_CLINIC_PRO',
		description: 'Para clínicas de alto volume e multi-especialidades',
		features: [
			'Tudo do Profissional',
			'Chatbot inteligente com IA',
			'Gestão de múltiplas especialidades',
			'Automação completa de no-show',
			'Relatórios avançados e analytics',
			'API personalizada para integrações',
			'Atendentes ilimitados',
			'Suporte dedicado e onboarding',
			'Personalização completa de fluxos',
			'Whitelabel (sem marca Doctor Chat Bot)',
		],
	},
	fundador: {
		key: 'fundador',
		name: 'Plano Fundador',
		priceBRL: 297,
		badge: 'Plano Fundador',
		badgeColor: 'emerald',
		isFounder: true,
		stripePriceIdEnvKey: 'STRIPE_PRICE_ID_FUNDADOR',
		description: 'Acesso antecipado com preço especial de lançamento',
		features: [
			'Chatbot inteligente com IA',
			'Tudo do Essencial incluído',
			'Preço garantido para sempre',
			'Early access a novas funcionalidades',
			'Badge de fundador exclusivo',
			'Suporte prioritário vitalício',
			'Sem aumento de preço futuro',
		],
	},
}

/**
 * Get plan by key
 */
export function getPlan(key: PlanKey): Plan {
	return PLANS[key]
}

/**
 * Get all plans as array
 */
export function getAllPlans(): Plan[] {
	return Object.values(PLANS)
}

/**
 * Get main plans (excluding founder plan)
 */
export function getMainPlans(): Plan[] {
	return [PLANS.essencial, PLANS.profissional, PLANS.clinic_pro]
}

/**
 * Get founder plan
 */
export function getFounderPlan(): Plan {
	return PLANS.fundador
}

/**
 * Get Stripe Price ID from environment for a given plan
 */
export function getStripePriceId(planKey: PlanKey): string | undefined {
	const plan = getPlan(planKey)
	return process.env[plan.stripePriceIdEnvKey]
}

/**
 * Validate if planKey is valid
 */
export function isValidPlanKey(key: string): key is PlanKey {
	return key in PLANS
}

/**
 * Get badge color classes for Tailwind
 */
export function getBadgeColorClasses(color?: 'blue' | 'purple' | 'amber' | 'emerald'): string {
	switch (color) {
		case 'blue':
			return 'bg-blue-500 text-white'
		case 'purple':
			return 'bg-purple-500 text-white'
		case 'amber':
			return 'bg-amber-500 text-white'
		case 'emerald':
			return 'bg-emerald-500 text-white'
		default:
			return 'bg-neutral-500 text-white'
	}
}

/**
 * Get border/ring color classes for recommended plans
 */
export function getRecommendedColorClasses(color?: 'blue' | 'purple' | 'amber' | 'emerald'): string {
	switch (color) {
		case 'blue':
			return 'border-blue-500 ring-2 ring-blue-100'
		case 'purple':
			return 'border-purple-500 ring-2 ring-purple-100'
		case 'amber':
			return 'border-amber-500 ring-2 ring-amber-100'
		case 'emerald':
			return 'border-emerald-500 ring-2 ring-emerald-100'
		default:
			return 'border-neutral-300'
	}
}
