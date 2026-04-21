import { NextRequest, NextResponse } from 'next/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/waitlist/[id]
 * Remove a patient from the waitlist (sets status back to 'open').
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSessionProfile()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('conversations')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', session.clinic.id)

  if (error) {
    console.error('[API/waitlist/[id]] DELETE error:', error)
    return NextResponse.json({ error: 'Erro ao remover da lista' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
