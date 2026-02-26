/**
 * Appointment Metrics Service
 * Cálculo de métricas de agenda (hoje e mês atual)
 */

import { createClient } from '@/lib/supabase/server'
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'

export interface TodayAppointmentStats {
  total: number
  scheduled: number
  confirmed: number
  completed: number
  canceled: number
  noShow: number
}

export interface MonthAppointmentStats {
  total: number
  confirmed: number
  completed: number
  canceled: number
  noShow: number
  confirmationRate: number // % de agendamentos confirmados (sobre agendados no mês)
  noShowRate: number // % de faltas (sobre atendimentos marcados/realizados)
}

export interface AppointmentMetricsResponse {
  today: TodayAppointmentStats
  month: MonthAppointmentStats
}

export async function getAppointmentMetrics(clinicId: string): Promise<AppointmentMetricsResponse> {
  const supabase = await createClient()

  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  // Buscar todos os appointments de hoje e do mês atual em uma única query cada
  const [{ data: todayAppointments }, { data: monthAppointments }] = await Promise.all([
    supabase
      .from('appointments')
      .select('status, starts_at')
      .eq('clinic_id', clinicId)
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString()),
    supabase
      .from('appointments')
      .select('status, starts_at')
      .eq('clinic_id', clinicId)
      .gte('starts_at', monthStart.toISOString())
      .lte('starts_at', monthEnd.toISOString()),
  ])

  const safeToday = todayAppointments || []
  const safeMonth = monthAppointments || []

  const today: TodayAppointmentStats = {
    total: safeToday.length,
    scheduled: safeToday.filter((a) => a.status === 'scheduled').length,
    confirmed: safeToday.filter((a) => a.status === 'confirmed').length,
    completed: safeToday.filter((a) => a.status === 'completed').length,
    canceled: safeToday.filter((a) => a.status === 'canceled').length,
    noShow: safeToday.filter((a) => a.status === 'no_show').length,
  }

  const monthTotal = safeMonth.length
  const monthConfirmed = safeMonth.filter((a) => a.status === 'confirmed').length
  const monthCompleted = safeMonth.filter((a) => a.status === 'completed').length
  const monthCanceled = safeMonth.filter((a) => a.status === 'canceled').length
  const monthNoShow = safeMonth.filter((a) => a.status === 'no_show').length

  const confirmationBase = safeMonth.filter((a) =>
    a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'completed'
  ).length

  const attendedOrNoShow = monthCompleted + monthNoShow

  const confirmationRate =
    confirmationBase > 0 ? Math.round((monthConfirmed / confirmationBase) * 1000) / 10 : 0

  const noShowRate =
    attendedOrNoShow > 0 ? Math.round((monthNoShow / attendedOrNoShow) * 1000) / 10 : 0

  const month: MonthAppointmentStats = {
    total: monthTotal,
    confirmed: monthConfirmed,
    completed: monthCompleted,
    canceled: monthCanceled,
    noShow: monthNoShow,
    confirmationRate,
    noShowRate,
  }

  return { today, month }
}
