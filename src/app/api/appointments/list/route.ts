import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Buscar perfil do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) {
      return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })
    }

    // Parâmetros de query
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const status = searchParams.get('status')
    const patientPhone = searchParams.get('patient_phone')
    const professionalId = searchParams.get('professional_id')
    const source = searchParams.get('source')

    // Query base
    let query = supabase
      .from('appointments')
      .select(
        `
        *,
        conversation:conversations(
          id,
          patient_name,
          patient_phone,
          status
        )
      `
      )
      .eq('clinic_id', profile.clinic_id)
      .order('starts_at', { ascending: true })

    // Aplicar filtros
    if (startDate) {
      query = query.gte('starts_at', startDate)
    }
    if (endDate) {
      query = query.lte('starts_at', endDate)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (patientPhone) {
      query = query.eq('patient_phone', patientPhone)
    }
    if (professionalId) {
      query = query.eq('professional_id', professionalId)
    }

    if (source === 'google') {
      query = query.eq('provider', 'google')
    } else if (source === 'manual') {
      query = query.eq('provider', 'manual').is('conversation_id', null)
    } else if (source === 'bot') {
      query = query
        .eq('provider', 'manual')
        .not('conversation_id', 'is', null)
        .ilike('description', '%via WhatsApp%')
    }

    const { data: appointments, error } = await query

    if (error) {
      console.error('Erro ao buscar agendamentos:', error)
      return NextResponse.json({ error: 'Erro ao buscar agendamentos' }, { status: 500 })
    }

    return NextResponse.json({ appointments })
  } catch (error) {
    console.error('Erro no endpoint de listagem:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
