/**
 * Script para executar migrations no Supabase
 * 
 * Uso: node scripts/run-migrations.js
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Configuração do Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('❌ Erro: Variáveis de ambiente não configuradas')
	console.error('Certifique-se de que NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão definidas')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
})

// Lista de migrations na ordem correta
const migrations = [
	'001_conversations_and_messages.sql',
	'002_bot_enabled_and_quick_replies.sql',
	'003_add_notes_to_conversations.sql',
	'004_add_last_patient_message_at.sql',
	'005_add_bot_state_and_context.sql',
	'006_add_zapi_message_id_to_messages.sql',
	'007_create_bot_settings.sql',
	'008_create_appointments_and_calendar_integrations.sql',
	'009_create_subscriptions.sql'
]

/**
 * Executa uma migration SQL
 */
async function runMigration(migrationFile) {
	const migrationPath = path.join(__dirname, '..', 'database', 'migrations', migrationFile)
	
	console.log(`\n📄 Executando: ${migrationFile}`)
	
	try {
		// Lê o arquivo SQL
		const sql = fs.readFileSync(migrationPath, 'utf8')
		
		// Remove comentários de exemplo (seção entre /* ... */)
		const cleanSql = sql.replace(/\/\*[\s\S]*?\*\//g, '')
		
		// Executa o SQL via RPC (usando função nativa do Postgres)
		const { data, error } = await supabase.rpc('exec_sql', { sql_query: cleanSql })
		
		if (error) {
			// Se RPC não existir, tenta executar diretamente
			if (error.code === 'PGRST202' || error.message?.includes('exec_sql')) {
				console.log('⚠️  RPC exec_sql não disponível, use o SQL Editor do Supabase')
				console.log('📋 Copie e cole este SQL no Supabase SQL Editor:')
				console.log('━'.repeat(80))
				console.log(cleanSql)
				console.log('━'.repeat(80))
				return { success: false, manual: true }
			}
			
			throw error
		}
		
		console.log(`✅ Concluída: ${migrationFile}`)
		return { success: true }
		
	} catch (error) {
		console.error(`❌ Erro em ${migrationFile}:`, error.message)
		return { success: false, error: error.message }
	}
}

/**
 * Executa todas as migrations
 */
async function runAllMigrations() {
	console.log('🚀 Iniciando execução das migrations...')
	console.log('📦 Total de migrations:', migrations.length)
	
	const results = []
	
	for (const migration of migrations) {
		const result = await runMigration(migration)
		results.push({ migration, ...result })
		
		// Se falhar, para a execução
		if (!result.success && !result.manual) {
			console.error('\n❌ Execução interrompida devido a erro')
			break
		}
		
		// Se precisar de execução manual, para
		if (result.manual) {
			console.log('\n⚠️  Execute as migrations manualmente no Supabase SQL Editor')
			console.log('📖 Instruções:')
			console.log('1. Acesse: https://supabase.com/dashboard/project/YOUR_PROJECT/sql')
			console.log('2. Copie e cole cada arquivo SQL da pasta database/migrations/')
			console.log('3. Execute na ordem numérica (001, 002, 003...)')
			break
		}
		
		// Aguarda um pouco entre migrations
		await new Promise(resolve => setTimeout(resolve, 500))
	}
	
	// Resumo final
	console.log('\n' + '═'.repeat(80))
	console.log('📊 RESUMO DA EXECUÇÃO')
	console.log('═'.repeat(80))
	
	const successful = results.filter(r => r.success).length
	const failed = results.filter(r => !r.success && !r.manual).length
	const manual = results.filter(r => r.manual).length
	
	console.log(`✅ Bem-sucedidas: ${successful}`)
	console.log(`❌ Falharam: ${failed}`)
	console.log(`⚠️  Requerem execução manual: ${manual}`)
	
	if (failed === 0 && manual === 0) {
		console.log('\n🎉 Todas as migrations foram executadas com sucesso!')
	} else if (manual > 0) {
		console.log('\n⚠️  Como o Supabase não permite execução direta de SQL via API,')
		console.log('você precisa executar as migrations manualmente no SQL Editor.')
		console.log('\n📖 Passo a passo:')
		console.log('1. Acesse o Supabase Dashboard: https://supabase.com/dashboard')
		console.log('2. Selecione seu projeto')
		console.log('3. Vá em SQL Editor (menu lateral)')
		console.log('4. Abra cada arquivo de migration da pasta database/migrations/')
		console.log('5. Copie e cole o conteúdo no editor')
		console.log('6. Clique em "Run" para executar')
		console.log('7. Repita para todas as 9 migrations na ordem')
	}
	
	console.log('═'.repeat(80))
}

// Executa o script
runAllMigrations().catch(error => {
	console.error('\n💥 Erro fatal:', error)
	process.exit(1)
})
