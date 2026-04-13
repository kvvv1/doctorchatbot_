/**
 * GET /api/local/conversations
 *
 * Serve conversas a partir do SQLite local para os hooks do browser
 * quando NEXT_PUBLIC_LOCAL_DB=sqlite.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLocalClient } from '@/lib/db/local-client'
import { LOCAL_CLINIC_ID } from '@/lib/db/sqlite'

export async function GET(request: NextRequest) {
  try {
    const client = createLocalClient()
    const { searchParams } = request.nextUrl
    const clinicId   = searchParams.get('clinic_id') || LOCAL_CLINIC_ID
    const search     = searchParams.get('search') || ''

    let query = client
      .from('conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (search.trim()) {
      query = query.or(
        `patient_name.ilike.%${search}%,patient_phone.ilike.%${search}%`,
      )
    }

    const { data, error } = await query

    if (error) {
      const errorMessage =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: unknown }).message ?? 'Erro ao buscar conversas locais')
          : 'Erro ao buscar conversas locais'

      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
