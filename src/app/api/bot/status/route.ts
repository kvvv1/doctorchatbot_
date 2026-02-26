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
		
		// TODO: Quando a tabela bot_config existir, buscar de lá
		// const { data, error } = await supabase
		// 	.from('bot_config')
		// 	.select('is_active')
		// 	.eq('clinic_id', session.clinic.id)
		// 	.single()
		//
		// if (error && error.code !== 'PGRST116') { // PGRST116 = not found
		// 	console.error('Error fetching bot status:', error)
		// 	return NextResponse.json({ error: 'Failed to fetch bot status' }, { status: 500 })
		// }
		
		// Por enquanto, retorna do localStorage do servidor (mock)
		// Na produção, isso virá do banco de dados
		return NextResponse.json({
			status: 'active', // TODO: Retornar do banco
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
		
		// TODO: Quando a tabela bot_config existir, salvar lá
		// const { error } = await supabase
		// 	.from('bot_config')
		// 	.upsert({
		// 		clinic_id: session.clinic.id,
		// 		is_active,
		// 		updated_at: new Date().toISOString(),
		// 	}, {
		// 		onConflict: 'clinic_id'
		// 	})
		//
		// if (error) {
		// 	console.error('Error updating bot status:', error)
		// 	return NextResponse.json({ error: 'Failed to update bot status' }, { status: 500 })
		// }

		return NextResponse.json({
			success: true,
			status: is_active ? 'active' : 'paused',
		})
	} catch (error) {
		console.error('Error in POST /api/bot/status:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
