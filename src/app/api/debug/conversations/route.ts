import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const admin = createAdminClient()

  // 1. Who is the current authenticated user?
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  // 2. What does auth.uid() return in a raw query?
  const { data: uidData, error: uidError } = await supabase
    .rpc('get_current_uid' as never)
    .single()
    .catch(() => ({ data: null, error: 'rpc not available' }))

  // 3. Can we read profiles for this user?
  const profileQuery = user
    ? await supabase.from('profiles').select('id, clinic_id, role').eq('id', user.id).maybeSingle()
    : { data: null, error: 'no user' }

  // 4. Can we read conversations directly?
  const convsQuery = await supabase
    .from('conversations')
    .select('id, clinic_id, status')
    .limit(5)

  // 5. Admin query (bypasses RLS) — how many conversations exist total?
  const adminConvsQuery = await admin
    .from('conversations')
    .select('id, clinic_id, status', { count: 'exact' })
    .limit(5)

  return NextResponse.json({
    auth: {
      user_id: user?.id ?? null,
      email: user?.email ?? null,
      error: userError?.message ?? null,
    },
    profile: {
      data: profileQuery.data,
      error: (profileQuery.error as Error | null)?.message ?? null,
    },
    conversations_via_rls: {
      count: convsQuery.data?.length ?? 0,
      rows: convsQuery.data ?? [],
      error: convsQuery.error?.message ?? null,
    },
    conversations_admin: {
      total: adminConvsQuery.count,
      rows: adminConvsQuery.data ?? [],
      error: adminConvsQuery.error?.message ?? null,
    },
  })
}
