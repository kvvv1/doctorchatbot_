/**
 * Bot Availability Service
 * Checks real working hours and existing appointments to determine free slots.
 * Uses bot_settings.working_hours (JSON) as the working hours source.
 */

import { addDays, addMinutes, format, getDay, parseISO, setHours, setMinutes, startOfDay } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatSlotLabel } from './actions'
import type { Slot, DayOption } from './context'
import type { BotSettings } from '@/lib/types/database'
import { GestaoDSService } from '@/lib/services/gestaods'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JS getDay() → BotSettings day key */
const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/**
 * Returns the WorkingHours config the BOT should use for scheduling slots.
 * When bot_scheduling_hours_enabled is true, uses bot_scheduling_hours.
 * Otherwise returns { enabled: false } — meaning no hours restriction on slots.
 * working_hours is intentionally NOT used here; it only controls the
 * "out-of-hours" message for human-attendant requests (handled in route.ts).
 */
function getBotSchedulingHours(botSettings: BotSettings): { hours: BotSettings['working_hours'] | null; enabled: boolean } {
  if (botSettings.bot_scheduling_hours_enabled && botSettings.bot_scheduling_hours) {
    return { hours: botSettings.bot_scheduling_hours, enabled: true }
  }
  return { hours: null, enabled: false }
}

/**
 * Parse a "HH:MM" string into { hours, minutes }.
 */
function parseHHMM(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number)
  return { hours: h, minutes: m ?? 0 }
}

/**
 * Fetch appointment duration and buffer for a clinic.
 * Falls back to sensible defaults if no row exists.
 * Only selects columns that are guaranteed to exist (migration 022).
 * buffer_time_minutes and min_advance_booking_hours are added by migration 023.
 */
async function getSettings(clinicId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('appointment_settings')
    .select('default_duration_minutes, buffer_time_minutes, min_advance_booking_hours')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    // Columns may not exist yet (migration 023 pending) — fall back gracefully
    const { data: fallback } = await supabase
      .from('appointment_settings')
      .select('default_duration_minutes')
      .eq('clinic_id', clinicId)
      .maybeSingle()
    return {
      durationMinutes: fallback?.default_duration_minutes ?? 30,
      bufferMinutes: 0,
      minAdvanceHours: 2,
    }
  }

  return {
    durationMinutes: data?.default_duration_minutes ?? 30,
    bufferMinutes: data?.buffer_time_minutes ?? 0,
    minAdvanceHours: data?.min_advance_booking_hours ?? 2,
  }
}

/**
 * Fetch appointments that overlap a given time window for a clinic.
 */
async function getConflictingAppointments(
  clinicId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<Array<{ starts_at: string; ends_at: string }>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('clinic_id', clinicId)
    .in('status', ['scheduled', 'confirmed'])
    .lt('starts_at', windowEnd.toISOString())
    .gt('ends_at', windowStart.toISOString())

  return data ?? []
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given day has working hours configured and enabled.
 * Uses the working_hours JSON stored in bot_settings.
 */
export function isDayWorking(botSettings: BotSettings, date: Date): boolean {
  const { hours, enabled } = getBotSchedulingHours(botSettings)
  if (!enabled || !hours) return true // no restriction

  const key = JS_DAY_TO_KEY[getDay(date)]
  const dayConfig = hours.days.find((d) => d.day === key)
  return !!dayConfig?.enabled
}

/**
 * Check whether a specific slot is free:
 *   - Within working hours
 *   - No conflicting appointment
 *   - Not in the past (respects min advance booking)
 */
export async function checkSlotAvailable(
  clinicId: string,
  startsAt: Date,
  endsAt: Date,
  botSettings: BotSettings
): Promise<boolean> {
  // 1. Past check
  const settings = await getSettings(clinicId)
  const earliest = new Date(Date.now() + settings.minAdvanceHours * 3_600_000)
  if (startsAt < earliest) return false

  // 2. Working hours check (uses bot scheduling hours if configured)
  const { hours: schedHours, enabled: schedEnabled } = getBotSchedulingHours(botSettings)
  if (schedEnabled && schedHours) {
    const key = JS_DAY_TO_KEY[getDay(startsAt)]
    const dayConfig = schedHours.days.find((d) => d.day === key)
    if (!dayConfig?.enabled) return false

    const { hours: sh, minutes: sm } = parseHHMM(dayConfig.start)
    const { hours: eh, minutes: em } = parseHHMM(dayConfig.end)
    const startOfWork = setMinutes(setHours(startOfDay(startsAt), sh), sm)
    const endOfWork = setMinutes(setHours(startOfDay(startsAt), eh), em)

    if (startsAt < startOfWork || endsAt > endOfWork) return false
  }

  // 3. Conflict check
  const conflicts = await getConflictingAppointments(clinicId, startsAt, endsAt)
  return conflicts.length === 0
}

/**
 * Return up to `count` available slots on `targetDate` (or nearby days).
 * Searches forward up to 14 days to find enough slots.
 */
export async function getAvailableSlots(
  clinicId: string,
  targetDate: Date,
  botSettings: BotSettings,
  count = 3
): Promise<Slot[]> {
  const external = await getExternalAvailableSlots(clinicId, targetDate, count)
  if (external.length > 0) {
    return external
  }

  const settings = await getSettings(clinicId)
  const { durationMinutes, bufferMinutes } = settings
  const stepMinutes = durationMinutes + bufferMinutes

  const slots: Slot[] = []
  const maxDaysAhead = 14
  let daysChecked = 0
  let cursor = startOfDay(targetDate)

  const { hours: schedHoursForGen, enabled: schedEnabledForGen } = getBotSchedulingHours(botSettings)

  while (slots.length < count && daysChecked < maxDaysAhead) {
    if (isDayWorking(botSettings, cursor)) {
      // Determine start and end of hours for this day
      let dayStart: Date
      let dayEnd: Date

      if (schedEnabledForGen && schedHoursForGen) {
        // Use explicit bot scheduling hours
        const key = JS_DAY_TO_KEY[getDay(cursor)]
        const dayConfig = schedHoursForGen.days.find((d) => d.day === key)

        if (dayConfig?.enabled) {
          const { hours: sh, minutes: sm } = parseHHMM(dayConfig.start)
          const { hours: eh, minutes: em } = parseHHMM(dayConfig.end)
          dayStart = setMinutes(setHours(cursor, sh), sm)
          dayEnd = setMinutes(setHours(cursor, eh), em)
        } else {
          cursor = addMinutes(cursor, 24 * 60)
          daysChecked++
          continue
        }
      } else {
        // No scheduling hours configured — use wide default (working_hours NOT used)
        dayStart = setMinutes(setHours(cursor, 8), 0)
        dayEnd = setMinutes(setHours(cursor, 18), 0)
      }

      // Walk through the day generating candidate slots
      let slotStart = dayStart
      while (slotStart < dayEnd && slots.length < count) {
        const slotEnd = addMinutes(slotStart, durationMinutes)
        if (slotEnd > dayEnd) break

        const available = await checkSlotAvailable(clinicId, slotStart, slotEnd, botSettings)
        if (available) {
          slots.push({
            startsAt: slotStart.toISOString(),
            endsAt: slotEnd.toISOString(),
            label: formatSlotLabel(slotStart),
          })
        }

        slotStart = addMinutes(slotStart, stepMinutes)
      }
    }

    cursor = addMinutes(cursor, 24 * 60)
    daysChecked++
  }

  return slots
}

async function getExternalAvailableSlots(
  clinicId: string,
  targetDate: Date,
  count: number,
): Promise<Slot[]> {
  const supabase = createAdminClient()
  const { data: integration } = await supabase
    .from('clinic_integrations')
    .select('provider, gestaods_api_token, gestaods_is_dev')
    .eq('clinic_id', clinicId)
    .eq('provider', 'gestaods')
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration?.gestaods_api_token) {
    return []
  }

  const settings = await getSettings(clinicId)
  const service = new GestaoDSService(
    integration.gestaods_api_token,
    integration.gestaods_is_dev ?? false,
  )

  const slots: Slot[] = []

  for (let offset = 0; offset < 7 && slots.length < count; offset++) {
    const date = addDays(startOfDay(targetDate), offset)
    const times = await loadGestaoDSAvailableTimes(service, date)

    for (const time of times) {
      const parsed = parseHHMM(time)
      const startsAt = setMinutes(setHours(date, parsed.hours), parsed.minutes)
      const endsAt = addMinutes(startsAt, settings.durationMinutes)

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        label: formatSlotLabel(startsAt),
      })

      if (slots.length >= count) break
    }
  }

  return slots
}

async function loadGestaoDSAvailableTimes(service: GestaoDSService, date: Date): Promise<string[]> {
  // GestaoDS expects dd/MM/yyyy; try that first, fallback to ISO format
  const attempts = [format(date, 'dd/MM/yyyy'), format(date, 'yyyy-MM-dd')]

  for (const candidate of attempts) {
    const response = await service.getAvailableTimes(candidate)
    if (!response.success) continue

    const normalized = normalizeGestaoDSTimes(response.data)
    if (normalized.length > 0) return normalized
  }

  return []
}

// ---------------------------------------------------------------------------
// List-based scheduling helpers
// ---------------------------------------------------------------------------

const PT_WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

/**
 * "YYYY-MM-DD" → "Segunda-feira, 28/04"
 */
export function formatDayLabel(dateStr: string): string {
  const date = parseISO(dateStr)
  const weekday = PT_WEEKDAYS[getDay(date)]
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${weekday}, ${day}/${month}`
}

/**
 * Date → "10h00"
 */
export function formatTimeLabel(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}h${m}`
}

/**
 * Return up to `limit` days (starting from `fromDate`) that have at least one
 * available slot. Skips up to 60 calendar days to find enough days.
 * Supports `offset` for "Ver mais datas" pagination.
 *
 * When GestaoDS is connected, uses the `dias-disponiveis` endpoint (single call)
 * instead of querying horarios for each day individually.
 */
export async function getAvailableDays(
  clinicId: string,
  botSettings: BotSettings,
  fromDate: Date = new Date(),
  limit = 8,
  offset = 0,
): Promise<DayOption[]> {
  const gestaoDSService = await getGestaoDSService(clinicId)

  if (gestaoDSService) {
    return getAvailableDaysFromGestaoDS(gestaoDSService, clinicId, fromDate, limit, offset)
  }

  // Fallback: internal slot generation (no GestaoDS)
  const days: DayOption[] = []
  let daysChecked = 0
  const maxDaysAhead = 60
  let cursor = startOfDay(fromDate)
  let found = 0

  while (days.length < limit && daysChecked < maxDaysAhead) {
    if (isDayWorking(botSettings, cursor)) {
      const slots = await getSlotsForDayInternal(clinicId, cursor, botSettings, 1)
      if (slots.length > 0) {
        if (found >= offset) {
          const dateStr = format(cursor, 'yyyy-MM-dd')
          days.push({ date: dateStr, label: formatDayLabel(dateStr) })
        }
        found++
      }
    }

    cursor = addDays(cursor, 1)
    daysChecked++
  }

  return days
}

/**
 * Uses GestaoDS `dias-disponiveis` endpoint (single API call) to get available days.
 * The endpoint returns the next ~30 days with availability status.
 * If we need more days, we make additional calls with a later fromDate.
 */
async function getAvailableDaysFromGestaoDS(
  service: GestaoDSService,
  clinicId: string,
  fromDate: Date,
  limit: number,
  offset: number,
): Promise<DayOption[]> {
  const days: DayOption[] = []
  let found = 0
  let batchFrom = startOfDay(fromDate)
  const maxBatches = 3 // avoid infinite loop if API keeps returning empty

  for (let batch = 0; batch < maxBatches && days.length < limit; batch++) {
    // Pass fromDate as dd/MM/yyyy so GestaoDS returns days from that point
    const fromStr = format(batchFrom, 'dd/MM/yyyy')
    const result = await service.getDiasDisponiveis(fromStr)
    const entries = result.data ?? []

    if (!result.success || entries.length === 0) break

    for (const entry of entries) {
      if (!entry.disponivel) continue

      // Parse dd/MM/yyyy → Date
      const [d, m, y] = entry.data.split('/').map(Number)
      const date = new Date(y, m - 1, d)

      if (date < startOfDay(fromDate)) continue // skip past dates

      if (found >= offset) {
        const dateStr = format(date, 'yyyy-MM-dd')
        days.push({ date: dateStr, label: formatDayLabel(dateStr) })
      }
      found++

      if (days.length >= limit) break
    }

    if (days.length >= limit) break

    // Advance batchFrom to the day after the last returned date
    const last = entries[entries.length - 1]
    if (last) {
      const [d, m, y] = last.data.split('/').map(Number)
      batchFrom = addDays(new Date(y, m - 1, d), 1)
    } else {
      break
    }
  }

  return days
}

/**
 * Return available time slots for a specific day (YYYY-MM-DD).
 * Labels use short format "10h00" (not full date+time).
 */
export async function getSlotsForDay(
  clinicId: string,
  day: string,
  botSettings: BotSettings,
  limit = 9,
): Promise<Slot[]> {
  const date = startOfDay(parseISO(day))

  const service = await getGestaoDSService(clinicId)
  if (service) {
    return getSlotsForDayExternal(clinicId, date, botSettings, limit, service)
  }

  return getSlotsForDayInternal(clinicId, date, botSettings, limit)
}

async function getSlotsForDayInternal(
  clinicId: string,
  date: Date,
  botSettings: BotSettings,
  limit: number,
): Promise<Slot[]> {
  const settings = await getSettings(clinicId)
  const { durationMinutes, bufferMinutes } = settings
  const stepMinutes = durationMinutes + bufferMinutes

  const slots: Slot[] = []

  if (!isDayWorking(botSettings, date)) return slots

  let dayStart: Date
  let dayEnd: Date

  const { hours: schedHours, enabled: schedEnabled } = getBotSchedulingHours(botSettings)
  if (schedEnabled && schedHours) {
    const key = JS_DAY_TO_KEY[getDay(date)]
    const dayConfig = schedHours.days.find((d) => d.day === key)
    if (!dayConfig?.enabled) return slots

    const { hours: sh, minutes: sm } = parseHHMM(dayConfig.start)
    const { hours: eh, minutes: em } = parseHHMM(dayConfig.end)
    dayStart = setMinutes(setHours(date, sh), sm)
    dayEnd = setMinutes(setHours(date, eh), em)
  } else {
    dayStart = setMinutes(setHours(date, 8), 0)
    dayEnd = setMinutes(setHours(date, 18), 0)
  }

  let slotStart = dayStart
  while (slotStart < dayEnd && slots.length < limit) {
    const slotEnd = addMinutes(slotStart, durationMinutes)
    if (slotEnd > dayEnd) break

    const available = await checkSlotAvailable(clinicId, slotStart, slotEnd, botSettings)
    if (available) {
      slots.push({
        startsAt: slotStart.toISOString(),
        endsAt: slotEnd.toISOString(),
        label: formatTimeLabel(slotStart),
      })
    }

    slotStart = addMinutes(slotStart, stepMinutes)
  }

  return slots
}

async function getSlotsForDayExternal(
  clinicId: string,
  date: Date,
  botSettings: BotSettings,
  limit: number,
  service: GestaoDSService,
): Promise<Slot[]> {
  const settings = await getSettings(clinicId)
  const times = await loadGestaoDSAvailableTimesWithService(clinicId, date, service)
  const slots: Slot[] = []

  for (const time of times) {
    if (slots.length >= limit) break
    const parsed = parseHHMM(time)
    const startsAt = setMinutes(setHours(date, parsed.hours), parsed.minutes)
    const endsAt = addMinutes(startsAt, settings.durationMinutes)
    slots.push({
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      label: formatTimeLabel(startsAt),
    })
  }

  return slots
}

// ---------------------------------------------------------------------------
// GestaoDS in-memory cache (TTL: 5 minutes)
// Avoids hitting the 30 req/hour rate limit when listing available days
// ---------------------------------------------------------------------------

interface CacheEntry {
  times: string[]
  expiresAt: number
}

const gestaoDSCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(clinicId: string, date: Date): string {
  return `${clinicId}:${format(date, 'yyyy-MM-dd')}`
}

function getCached(clinicId: string, date: Date): string[] | null {
  const key = getCacheKey(clinicId, date)
  const entry = gestaoDSCache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    gestaoDSCache.delete(key)
    return null
  }
  return entry.times
}

function setCache(clinicId: string, date: Date, times: string[]): void {
  const key = getCacheKey(clinicId, date)
  gestaoDSCache.set(key, { times, expiresAt: Date.now() + CACHE_TTL_MS })
}

/**
 * Returns an initialized GestaoDSService if the clinic has a connected integration,
 * or null if not connected. Fetches the DB row only once per call.
 */
async function getGestaoDSService(clinicId: string): Promise<GestaoDSService | null> {
  const supabase = createAdminClient()
  const { data: integration } = await supabase
    .from('clinic_integrations')
    .select('gestaods_api_token, gestaods_is_dev')
    .eq('clinic_id', clinicId)
    .eq('provider', 'gestaods')
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration?.gestaods_api_token) return null
  // Default false = production endpoints (/api/agendamento/); dev- prefix returns 500 for scheduling
  return new GestaoDSService(integration.gestaods_api_token, integration.gestaods_is_dev ?? false)
}

/**
 * Load available times using a pre-fetched service instance and cache the result.
 */
async function loadGestaoDSAvailableTimesWithService(
  clinicId: string,
  date: Date,
  service: GestaoDSService,
): Promise<string[]> {
  const cached = getCached(clinicId, date)
  if (cached !== null) return cached

  const times = await loadGestaoDSAvailableTimes(service, date)
  setCache(clinicId, date, times)
  return times
}

async function hasGestaoDSIntegration(clinicId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('clinic_integrations')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('provider', 'gestaods')
    .eq('is_connected', true)
    .maybeSingle()
  return !!data
}

async function loadGestaoDSAvailableTimesForClinic(clinicId: string, date: Date): Promise<string[]> {
  // Check cache first
  const cached = getCached(clinicId, date)
  if (cached !== null) return cached

  const supabase = createAdminClient()
  const { data: integration } = await supabase
    .from('clinic_integrations')
    .select('gestaods_api_token, gestaods_is_dev')
    .eq('clinic_id', clinicId)
    .eq('provider', 'gestaods')
    .eq('is_connected', true)
    .maybeSingle()

  if (!integration?.gestaods_api_token) return []

  const service = new GestaoDSService(
    integration.gestaods_api_token,
    integration.gestaods_is_dev ?? false,
  )

  const times = await loadGestaoDSAvailableTimes(service, date)
  setCache(clinicId, date, times)
  return times
}

function normalizeGestaoDSTimes(payload: unknown): string[] {
  if (!Array.isArray(payload)) return []

  return payload
    .map(item => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return null

      const record = item as Record<string, unknown>
      const raw = record.horario || record.hora || record.time || record.label
      return typeof raw === 'string' ? raw : null
    })
    .filter((value): value is string => typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value))
}
