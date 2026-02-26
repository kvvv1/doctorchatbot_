/**
 * Plan Features & Restrictions
 * Centralized feature access control per plan
 */

import { PlanKey } from '@/lib/types/database'

/**
 * Features that can be restricted by plan
 */
export enum PlanFeature {
	// Bot features
	BOT_ENABLED = 'bot_enabled',
	BOT_CUSTOM_FLOWS = 'bot_custom_flows',
	
	// Calendar features
	CALENDAR_INTEGRATION = 'calendar_integration',
	CALENDAR_AUTO_CONFIRMATION = 'calendar_auto_confirmation',
	
	// Team features
	MULTIPLE_ATTENDANTS = 'multiple_attendants',
	UNLIMITED_ATTENDANTS = 'unlimited_attendants',
	
	// Advanced features
	ADVANCED_REPORTS = 'advanced_reports',
	NO_SHOW_AUTOMATION = 'no_show_automation',
	CUSTOM_API = 'custom_api',
	WHITELABEL = 'whitelabel',
	
	// Support
	PRIORITY_SUPPORT = 'priority_support',
	DEDICATED_SUPPORT = 'dedicated_support',
}

/**
 * Numeric limits for each plan
 */
export interface PlanLimits {
	maxAttendants: number // -1 means unlimited
	maxConversationsPerMonth: number // -1 means unlimited
	maxQuickReplies: number // -1 means unlimited
}

/**
 * Plan features configuration
 */
export const PLAN_FEATURES: Record<PlanKey, Set<PlanFeature>> = {
	essencial: new Set([
		PlanFeature.BOT_ENABLED,
	]),
	
	profissional: new Set([
		PlanFeature.BOT_ENABLED,
		PlanFeature.BOT_CUSTOM_FLOWS,
		PlanFeature.CALENDAR_INTEGRATION,
		PlanFeature.CALENDAR_AUTO_CONFIRMATION,
		PlanFeature.MULTIPLE_ATTENDANTS,
		PlanFeature.ADVANCED_REPORTS,
		PlanFeature.PRIORITY_SUPPORT,
	]),
	
	clinic_pro: new Set([
		PlanFeature.BOT_ENABLED,
		PlanFeature.BOT_CUSTOM_FLOWS,
		PlanFeature.CALENDAR_INTEGRATION,
		PlanFeature.CALENDAR_AUTO_CONFIRMATION,
		PlanFeature.MULTIPLE_ATTENDANTS,
		PlanFeature.UNLIMITED_ATTENDANTS,
		PlanFeature.ADVANCED_REPORTS,
		PlanFeature.NO_SHOW_AUTOMATION,
		PlanFeature.CUSTOM_API,
		PlanFeature.WHITELABEL,
		PlanFeature.DEDICATED_SUPPORT,
	]),
	
	fundador: new Set([
		PlanFeature.BOT_ENABLED,
		PlanFeature.PRIORITY_SUPPORT,
	]),
}

/**
 * Plan limits configuration
 */
export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
	essencial: {
		maxAttendants: 1,
		maxConversationsPerMonth: 500,
		maxQuickReplies: 20,
	},
	profissional: {
		maxAttendants: 5,
		maxConversationsPerMonth: 2000,
		maxQuickReplies: 50,
	},
	clinic_pro: {
		maxAttendants: -1, // unlimited
		maxConversationsPerMonth: -1, // unlimited
		maxQuickReplies: -1, // unlimited
	},
	fundador: {
		maxAttendants: 1,
		maxConversationsPerMonth: 500,
		maxQuickReplies: 20,
	},
}

/**
 * Check if a plan has access to a specific feature
 */
export function hasFeatureAccess(planKey: PlanKey | null, feature: PlanFeature): boolean {
	if (!planKey) return false
	return PLAN_FEATURES[planKey]?.has(feature) || false
}

/**
 * Check if a plan has reached a specific limit
 */
export function isWithinLimit(
	planKey: PlanKey | null,
	limitType: keyof PlanLimits,
	currentValue: number
): boolean {
	if (!planKey) return false
	
	const limit = PLAN_LIMITS[planKey]?.[limitType]
	if (limit === undefined) return false
	if (limit === -1) return true // unlimited
	
	return currentValue < limit
}

/**
 * Get the limit value for a specific plan
 */
export function getPlanLimit(
	planKey: PlanKey | null,
	limitType: keyof PlanLimits
): number {
	if (!planKey) return 0
	return PLAN_LIMITS[planKey]?.[limitType] || 0
}

/**
 * Get all features for a plan
 */
export function getPlanFeatures(planKey: PlanKey | null): Set<PlanFeature> {
	if (!planKey) return new Set()
	return PLAN_FEATURES[planKey] || new Set()
}

/**
 * Get readable feature name
 */
export function getFeatureName(feature: PlanFeature): string {
	const names: Record<PlanFeature, string> = {
		[PlanFeature.BOT_ENABLED]: 'Chatbot Inteligente',
		[PlanFeature.BOT_CUSTOM_FLOWS]: 'Fluxos Personalizados',
		[PlanFeature.CALENDAR_INTEGRATION]: 'Integração com Google Calendar',
		[PlanFeature.CALENDAR_AUTO_CONFIRMATION]: 'Confirmação Automática',
		[PlanFeature.MULTIPLE_ATTENDANTS]: 'Múltiplos Atendentes',
		[PlanFeature.UNLIMITED_ATTENDANTS]: 'Atendentes Ilimitados',
		[PlanFeature.ADVANCED_REPORTS]: 'Relatórios Avançados',
		[PlanFeature.NO_SHOW_AUTOMATION]: 'Automação de No-Show',
		[PlanFeature.CUSTOM_API]: 'API Personalizada',
		[PlanFeature.WHITELABEL]: 'Whitelabel',
		[PlanFeature.PRIORITY_SUPPORT]: 'Suporte Prioritário',
		[PlanFeature.DEDICATED_SUPPORT]: 'Suporte Dedicado',
	}
	return names[feature] || feature
}

/**
 * Check multiple features at once
 */
export function hasAllFeatures(planKey: PlanKey | null, features: PlanFeature[]): boolean {
	return features.every(feature => hasFeatureAccess(planKey, feature))
}

/**
 * Check if at least one feature is available
 */
export function hasAnyFeature(planKey: PlanKey | null, features: PlanFeature[]): boolean {
	return features.some(feature => hasFeatureAccess(planKey, feature))
}
