import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/waitlist
 * Returns all waitlist conversations for the authenticated clinic.
 */
export async function GET() {
  const session = await getSessionProfile()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, patient_name, patient_phone, waitlist_preferred_time_start, waitlist_preferred_time_end, waitlist_appointment_type, waitlist_expires_at, updated_at')
    .eq('clinic_id', session.clinic.id)
    .eq('status', 'waitlist')
    .or(`waitlist_expires_at.is.null,waitlist_expires_at.gt.${now}`)
    .order('updated_at', { ascending: true })

  if (error) {
    console.error('[API/waitlist] GET error:', error)
    return NextResponse.json({ error: 'Erro ao buscar lista de espera' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/waitlist
 * Manually add a patient to the waitlist.
 * Body: { patientName, patientPhone, timeStart?, timeEnd?, appointmentType? }
 */
export async function POST(request: NextRequest) {
  const session = await getSessionProfile()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { patientName, patientPhone, timeStart, timeEnd, appointmentType } = body

  if (!patientName?.trim() || !patientPhone?.trim()) {
    return NextResponse.json({ error: 'Nome e telefone são obrigatórios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Normalize phone: keep only digits
  const phone = patientPhone.replace(/\D/g, '')

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  // Upsert: if conversation already exists for phone+clinic, just update status
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('clinic_id', session.clinic.id)
    .eq('patient_phone', phone)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()

  if (existing) {
    const { error } = await supabase
      .from('conversations')
      .update({
        status: 'waitlist',
        patient_name: patientName.trim(),
        waitlist_preferred_time_start: timeStart || null,
        waitlist_preferred_time_end: timeEnd || null,
        waitlist_appointment_type: appointmentType || null,
        waitlist_expires_at: expiresAt.toISOString(),
        updated_at: now,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('[API/waitlist] POST update error:', error)
      return NextResponse.json({ error: 'Erro ao adicionar à lista' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: existing.id })
  }

  // Create new conversation in waitlist status
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      clinic_id: session.clinic.id,
      patient_phone: phone,
      patient_name: patientName.trim(),
      status: 'waitlist',
      bot_state: 'menu',
      bot_enabled: false,
      waitlist_preferred_time_start: timeStart || null,
      waitlist_preferred_time_end: timeEnd || null,
      waitlist_appointment_type: appointmentType || null,
      waitlist_expires_at: expiresAt.toISOString(),
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[API/waitlist] POST insert error:', error)
    return NextResponse.json({ error: 'Erro ao criar entrada na lista de espera' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: created.id })
}
