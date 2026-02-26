/**
 * Export Appointments to iCal (.ics file)
 * GET /api/export/ical
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateICalFeed } from '@/lib/calendar/icalGenerator'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's clinic_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) {
      return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })
    }

    // Generate iCal feed
    const icalContent = await generateICalFeed(profile.clinic_id)

    // Return as downloadable .ics file
    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="agenda.ics"',
      },
    })
  } catch (error) {
    console.error('Erro ao gerar iCal:', error)
    return NextResponse.json({ error: 'Erro ao gerar arquivo iCal' }, { status: 500 })
  }
}
