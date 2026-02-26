/**
 * Bot Settings Service
 * 
 * Handles fetching and updating bot configuration settings per clinic.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { BotSettings, WorkingHours } from '@/lib/types/database'

/**
 * Get bot settings for a clinic (admin/server-side).
 * Creates default settings if none exist.
 * 
 * @param clinicId - The clinic ID
 * @returns Bot settings or null if error
 */
export async function getBotSettings(clinicId: string): Promise<BotSettings | null> {
  const supabase = createAdminClient()

  try {
    // Use the stored function to get or create settings
    const { data, error } = await supabase
      .rpc('get_or_create_bot_settings', { p_clinic_id: clinicId })
      .single()

    if (error) {
      console.error('[BotSettingsService] Error getting bot settings:', error)
      return null
    }

    return data as BotSettings
  } catch (err) {
    console.error('[BotSettingsService] Unexpected error:', err)
    return null
  }
}

/**
 * Get bot settings for the current authenticated user's clinic.
 * 
 * @returns Bot settings or null if error
 */
export async function getBotSettingsForCurrentUser(): Promise<BotSettings | null> {
  const supabase = await createClient()

  try {
    // Get current user's profile to find clinic_id
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      console.error('[BotSettingsService] No authenticated user')
      return null
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[BotSettingsService] Error getting profile:', profileError)
      return null
    }

    // Get or create bot settings
    const { data, error } = await supabase
      .rpc('get_or_create_bot_settings', { p_clinic_id: profile.clinic_id })
      .single()

    if (error) {
      console.error('[BotSettingsService] Error getting bot settings:', error)
      return null
    }

    return data as BotSettings
  } catch (err) {
    console.error('[BotSettingsService] Unexpected error:', err)
    return null
  }
}

/**
 * Update bot settings for a clinic.
 * 
 * @param clinicId - The clinic ID
 * @param updates - Partial bot settings to update
 * @returns Updated bot settings or null if error
 */
export async function updateBotSettings(
  clinicId: string,
  updates: Partial<Omit<BotSettings, 'id' | 'clinic_id' | 'created_at' | 'updated_at'>>
): Promise<BotSettings | null> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('bot_settings')
      .update(updates)
      .eq('clinic_id', clinicId)
      .select()
      .single()

    if (error) {
      console.error('[BotSettingsService] Error updating bot settings:', error)
      return null
    }

    return data as BotSettings
  } catch (err) {
    console.error('[BotSettingsService] Unexpected error:', err)
    return null
  }
}

/**
 * Check if current time is within working hours for a clinic.
 * 
 * @param settings - Bot settings containing working hours configuration
 * @param now - Optional date to check (defaults to current time)
 * @returns true if within working hours, false otherwise
 */
export function isWithinWorkingHours(
  settings: BotSettings,
  now: Date = new Date()
): boolean {
  if (!settings.working_hours_enabled) {
    return true // Always within hours if feature is disabled
  }

  const { working_hours } = settings
  
  // Convert current time to clinic timezone
  const timeInTimezone = new Intl.DateTimeFormat('en-US', {
    timeZone: working_hours.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  // Parse day of week
  const dayMap: Record<string, string> = {
    'Mon': 'mon',
    'Tue': 'tue',
    'Wed': 'wed',
    'Thu': 'thu',
    'Fri': 'fri',
    'Sat': 'sat',
    'Sun': 'sun',
  }

  const currentDay = timeInTimezone.split(',')[0].trim()
  const currentTime = timeInTimezone.split(',')[1].trim()
  const dayKey = dayMap[currentDay]

  if (!dayKey) {
    return false
  }

  // Find day configuration
  const dayConfig = working_hours.days.find(d => d.day === dayKey)

  if (!dayConfig || !dayConfig.enabled) {
    return false
  }

  // Check if current time is within the day's hours
  const [currentHour, currentMinute] = currentTime.split(':').map(Number)
  const [startHour, startMinute] = dayConfig.start.split(':').map(Number)
  const [endHour, endMinute] = dayConfig.end.split(':').map(Number)

  const currentMinutes = currentHour * 60 + currentMinute
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}
