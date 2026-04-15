import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      .select('id, clinic_id, status, patient_phone', { count: 'exact' })
      .limit(10)

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
        rows: adminResult.data ?? [],
        error: adminResult.error?.message ?? null,
      },
    })
  } catch (err) {
    return NextResponse.json({ fatal_error: String(err) }, { status: 500 })
  }
}
