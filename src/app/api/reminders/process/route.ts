/**
 * API Route: Process Pending Reminders
 * 
 * ⚡ ESTE ENDPOINT ENVIA MENSAGENS VIA WHATSAPP ⚡
 * 
 * Deve ser chamado por um CRON JOB a cada 5-10 minutos.
 * 
 * Como funciona:
 * 1. Busca lembretes pendentes (48h, 24h, 2h antes das consultas)
 * 2. Preenche templates com dados reais do paciente
 * 3. ENVIA via Z-API WhatsApp
 * 4. Marca como enviado ou falhou
 * 
 * SEGURANÇA: Requer header Authorization com CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Permite até 60 segundos de processamento

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
	try {
		// 🔐 SEGURANÇA: Verifica o CRON_SECRET
		const authHeader = request.headers.get('authorization')
		const expectedSecret = process.env.CRON_SECRET

		if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
			console.error('[Cron] ❌ Tentativa de acesso não autorizada')
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		console.log('[Cron] 🚀 Iniciando processamento de lembretes...')
		const startTime = Date.now()

		const supabase = createClient(supabaseUrl, supabaseServiceKey)

		// Busca lembretes pendentes (cuja hora chegou)
		const { data: reminders, error } = await supabase.rpc('get_pending_reminders')

		if (error) {
			console.error('[Cron] Erro ao buscar lembretes:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		if (!reminders || reminders.length === 0) {
			console.log('[Cron] ✓ Nenhum lembrete pendente')
			return NextResponse.json({
				success: true,
				processed: 0,
				succeeded: 0,
				failed: 0,
				message: 'Nenhum lembrete pendente',
			})
		}

		console.log(`[Cron] 📋 Processando ${reminders.length} lembretes...`)

		let succeeded = 0
		let failed = 0

		// Processa cada lembrete
		for (const reminder of reminders) {
			try {
				console.log(`[Cron] 📬 Processando: ${reminder.type} para ${reminder.recipient_phone}`)

				// Busca detalhes do agendamento
				const { data: appointment } = await supabase
					.from('appointments')
					.select('*')
					.eq('id', reminder.appointment_id)
					.single()

				if (!appointment) {
					throw new Error('Agendamento não encontrado')
				}

				// Preenche o template com dados reais
				const message = fillTemplate(reminder.message_template, appointment)

				// Busca credenciais Z-API da clínica
				const { data: clinic } = await supabase
					.from('clinics')
					.select('id, name, zapi_instance_id, zapi_token')
					.eq('id', reminder.clinic_id)
					.single()

				if (!clinic?.zapi_instance_id || !clinic?.zapi_token) {
					throw new Error('Z-API não configurado para esta clínica')
				}

				// 📱 ENVIA MENSAGEM VIA WHATSAPP (Z-API)
				const zapiUrl = `https://api.z-api.io/instances/${clinic.zapi_instance_id}/token/${clinic.zapi_token}/send-text`

				console.log(`[Cron] 📲 Enviando para ${reminder.recipient_phone}...`)

				const response = await fetch(zapiUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						phone: reminder.recipient_phone,
						message: message,
					}),
				})

				const responseData = await response.json()

				if (!response.ok) {
					throw new Error(`Z-API error: ${responseData.error || response.statusText}`)
				}

				// ✅ Marca lembrete como enviado
				await supabase
					.from('reminders')
					.update({
						status: 'sent',
						sent_at: new Date().toISOString(),
						message_sent: message,
					})
					.eq('id', reminder.id)

				console.log(`[Cron] ✅ Enviado com sucesso: ${reminder.type}`)
				succeeded++

			} catch (error) {
				console.error(`[Cron] ❌ Falha ao processar lembrete ${reminder.id}:`, error)

				// Marca como falha e incrementa contador de tentativas
				await supabase
					.from('reminders')
					.update({
						status: 'failed',
						error_message: error instanceof Error ? error.message : 'Erro desconhecido',
						retry_count: (reminder.retry_count || 0) + 1,
					})
					.eq('id', reminder.id)

				failed++
			}
		}

		const duration = Date.now() - startTime

		console.log(`[Cron] ✓ Concluído em ${duration}ms: ${succeeded} enviados, ${failed} falharam`)

		return NextResponse.json({
			success: true,
			processed: reminders.length,
			succeeded,
			failed,
			duration: `${duration}ms`,
			timestamp: new Date().toISOString(),
		})

	} catch (error) {
		console.error('[Cron] ❌ Erro crítico:', error)
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Erro desconhecido',
			},
			{ status: 500 }
		)
	}
}

// Também aceita GET (alguns serviços de cron preferem GET)
export async function GET(request: NextRequest) {
	return POST(request)
}

/**
 * Preenche templates de mensagem com dados reais
 * 
 * Variáveis disponíveis:
 * - {name} -> Nome do paciente
 * - {date} -> Data formatada (DD/MM/YYYY)
 * - {time} -> Hora formatada (HH:MM)
 * - {day} -> Dia da semana por extenso
 */
function fillTemplate(template: string, appointment: any): string {
	const startsAt = new Date(appointment.starts_at)

	const replacements: Record<string, string> = {
		'{name}': appointment.patient_name,
		'{date}': startsAt.toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			timeZone: 'America/Sao_Paulo',
		}),
		'{time}': startsAt.toLocaleTimeString('pt-BR', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'America/Sao_Paulo',
		}),
		'{day}': startsAt.toLocaleDateString('pt-BR', {
			weekday: 'long',
			timeZone: 'America/Sao_Paulo',
		}),
	}

	let message = template
	for (const [key, value] of Object.entries(replacements)) {
		message = message.replace(new RegExp(key, 'g'), value)
	}

	return message
}
