import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConversationMode } from '@/lib/conversations/mode'
import { normalizePhoneForStorage } from '@/lib/utils/phone'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // 1. Who is the current authenticated user?
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    // 2. Can we read profiles for this user?
    let profileData = null
    let profileError = null
    if (user) {
      const result = await supabase.from('profiles').select('id, clinic_id, role').eq('id', user.id).maybeSingle()
      profileData = result.data
      profileError = result.error?.message ?? null
    }

    // 3. Conversations visible via RLS (what the frontend sees)
    const convsResult = await supabase
      .from('conversations')
      .select('id, clinic_id, status, patient_phone')
      .limit(10)

    // 4. Admin query (bypasses RLS)
    const adminResult = await admin
      .from('conversations')
      .select('id, clinic_id, status, patient_phone, bot_enabled, bot_state, updated_at, reconciliation_state', { count: 'exact' })
      .limit(10)

    const degradedResult = await admin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .neq('reconciliation_state', 'healthy')

    const backlogResult = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('external_status', ['pending', 'unknown'])

    const duplicateGroups = new Map<string, number>()
    for (const row of adminResult.data ?? []) {
      const key = `${row.clinic_id}:${normalizePhoneForStorage(row.patient_phone) ?? row.patient_phone}`
      duplicateGroups.set(key, (duplicateGroups.get(key) ?? 0) + 1)
    }

    return NextResponse.json({
      auth: {
        user_id: user?.id ?? null,
        email: user?.email ?? null,
        error: userError?.message ?? null,
      },
      profile: {
        data: profileData,
        error: profileError,
      },
      conversations_via_rls: {
        count: convsResult.data?.length ?? 0,
        rows: convsResult.data ?? [],
        error: convsResult.error?.message ?? null,
      },
      conversations_admin: {
        total: adminResult.count,
        rows: (adminResult.data ?? []).map((row) => ({
          ...row,
          mode: getConversationMode({
            bot_enabled: Boolean(row.bot_enabled),
            status: row.status,
          }),
          normalized_phone: normalizePhoneForStorage(row.patient_phone),
        })),
        error: adminResult.error?.message ?? null,
      },
      duplicate_phone_groups: [...duplicateGroups.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count })),
      diagnostics: {
        degraded_count: degradedResult.count ?? 0,
        pending_or_unknown_backlog: backlogResult.count ?? 0,
      },
    })
  } catch (err) {
    return NextResponse.json({ fatal_error: String(err) }, { status: 500 })
  }
}
