/**
 * Export Appointments to CSV
 * GET /api/export/csv?startDate=...&endDate=...
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAppointmentsCSV } from '@/lib/calendar/icalGenerator'

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

    // Parse query params
    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    const startDate = startDateParam ? new Date(startDateParam) : undefined
    const endDate = endDateParam ? new Date(endDateParam) : undefined

    // Generate CSV
    const csvContent = await generateAppointmentsCSV(profile.clinic_id, startDate, endDate)

    const filename = startDate && endDate 
      ? `agendamentos_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`
      : 'agendamentos.csv'

    // Return as downloadable .csv file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Erro ao gerar CSV:', error)
    return NextResponse.json({ error: 'Erro ao gerar arquivo CSV' }, { status: 500 })
  }
}
