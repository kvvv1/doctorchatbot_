import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAppointmentMetrics } from '@/lib/services/appointmentMetrics'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) {
      return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })
    }

    const metrics = await getAppointmentMetrics(profile.clinic_id)

    return NextResponse.json({ success: true, metrics })
  } catch (error) {
    console.error('Erro ao buscar métricas de agendamentos:', error)
    return NextResponse.json(
      { error: 'Erro interno ao buscar métricas de agendamentos' },
      { status: 500 }
    )
  }
}
