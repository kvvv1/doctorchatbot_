import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/getSessionProfile'

export const dynamic = 'force-dynamic'

// GET - Buscar status do bot
export async function GET() {
	try {
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const supabase = await createClient()

		const { data, error } = await supabase
			.from('bot_settings')
			.select('bot_globally_enabled')
			.eq('clinic_id', session.clinic.id)
			.single()

		if (error && error.code !== 'PGRST116') {
			console.error('Error fetching bot status:', error)
			return NextResponse.json({ error: 'Failed to fetch bot status' }, { status: 500 })
		}

		// Default to active if no settings row yet
		const isActive = data?.bot_globally_enabled !== false

		return NextResponse.json({
			status: isActive ? 'active' : 'paused',
			clinic_id: session.clinic.id,
		})
	} catch (error) {
		console.error('Error in GET /api/bot/status:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Atualizar status do bot
export async function POST(request: Request) {
	try {
		const session = await getSessionProfile()
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await request.json()
		const { is_active } = body

		if (typeof is_active !== 'boolean') {
			return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
		}

		const supabase = await createClient()

		const { error } = await supabase
			.from('bot_settings')
			.upsert(
				{
					clinic_id: session.clinic.id,
					bot_globally_enabled: is_active,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: 'clinic_id' }
			)

		if (error) {
			console.error('Error updating bot status:', error)
			return NextResponse.json({ error: 'Failed to update bot status' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			status: is_active ? 'active' : 'paused',
		})
	} catch (error) {
		console.error('Error in POST /api/bot/status:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
