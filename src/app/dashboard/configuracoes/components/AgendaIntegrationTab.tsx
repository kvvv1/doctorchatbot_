'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CalendarIntegration } from '@/lib/types/database'

interface AgendaIntegrationTabProps {
	clinicId: string
}

export default function AgendaIntegrationTab({ clinicId }: AgendaIntegrationTabProps) {
	const searchParams = useSearchParams()

	const [integration, setIntegration] = useState<CalendarIntegration | null>(null)
	const [gestaoDsEnabled, setGestaoDsEnabled] = useState(false)
	const [gestaoDsIsDev, setGestaoDsIsDev] = useState(true)
	const [gestaoDsHasToken, setGestaoDsHasToken] = useState(false)
	const [gestaoDsToken, setGestaoDsToken] = useState('')
	const [gestaoDsLastSyncAt, setGestaoDsLastSyncAt] = useState<string | null>(null)
	const [gestaoDsSyncError, setGestaoDsSyncError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [connecting, setConnecting] = useState(false)
	const [disconnecting, setDisconnecting] = useState(false)
	const [savingGestaoDs, setSavingGestaoDs] = useState(false)
	const [syncingGestaoDs, setSyncingGestaoDs] = useState(false)
	const [importingGestaoDs, setImportingGestaoDs] = useState(false)
	const [disablingAll, setDisablingAll] = useState(false)
	const [message, setMessage] = useState<{
		type: 'success' | 'error'
		text: string
	} | null>(null)

	// Lê mensagens de sucesso/erro da URL (?error=... / ?success=connected)
	useEffect(() => {
		const error = searchParams.get('error')
		const success = searchParams.get('success')

		if (error) {
			const errorMessages: Record<string, string> = {
				oauth_failed: 'Falha na autenticação com o Google',
				no_code: 'Código de autenticação não recebido',
				unauthorized: 'Você precisa estar logado',
				profile_not_found: 'Perfil não encontrado',
				update_failed: 'Erro ao atualizar integração',
				insert_failed: 'Erro ao criar integração',
				callback_failed: 'Erro no processo de autenticação',
			}

			setMessage({
				type: 'error',
				text: errorMessages[error] || 'Erro desconhecido',
			})
		}

		if (success === 'connected') {
			setMessage({
				type: 'success',
				text: 'Google Calendar conectado com sucesso!',
			})
		}
	}, [searchParams])

	// Busca status da integração
	const fetchIntegration = useCallback(async () => {
		try {
			setLoading(true)
			const supabase = createClient()

			const { data: clinicData, error: clinicError } = await supabase
				.from('clinic_integrations')
				.select('*')
				.eq('clinic_id', clinicId)
				.eq('provider', 'google')
				.maybeSingle()

			if (clinicError && clinicError.code !== 'PGRST116') {
				console.error('Error fetching clinic integration:', clinicError)
			}

			if (clinicData) {
				setIntegration(clinicData as unknown as CalendarIntegration)
				return
			}

			const { data: legacyData, error: legacyError } = await supabase
				.from('calendar_integrations')
				.select('*')
				.eq('clinic_id', clinicId)
				.maybeSingle()

			if (legacyError && legacyError.code !== 'PGRST116') {
				console.error('Error fetching legacy integration:', legacyError)
				return
			}

			setIntegration(legacyData)
		} catch (err) {
			console.error('Error fetching integration:', err)
		}
	}, [clinicId])

	const fetchGestaoDS = useCallback(async () => {
		try {
			const response = await fetch('/api/integrations/gestaods')
			if (!response.ok) {
				throw new Error('Falha ao carregar GestãoDS')
			}

			const data = await response.json()
			setGestaoDsEnabled(!!data.enabled)
			setGestaoDsIsDev(data.isDev ?? true)
			setGestaoDsHasToken(!!data.hasToken)
			setGestaoDsLastSyncAt(data.lastSyncAt ?? null)
			setGestaoDsSyncError(data.syncError ?? null)
		} catch (err) {
			console.error('Error fetching GestãoDS integration:', err)
		}
	}, [])

	useEffect(() => {
		const runFetch = async () => {
			setLoading(true)
			await Promise.all([fetchIntegration(), fetchGestaoDS()])
			setLoading(false)
		}

		runFetch()
	}, [fetchGestaoDS, fetchIntegration])

	const handleConnect = async () => {
		setConnecting(true)
		setMessage(null)

		try {
			window.location.href = '/api/google/oauth/start'
		} catch (err) {
			console.error('Error connecting:', err)
			setMessage({ type: 'error', text: 'Erro ao iniciar conexão' })
			setConnecting(false)
		}
	}

	const handleDisconnect = async () => {
		if (
			!confirm(
				'Tem certeza que deseja desconectar o Google Calendar? Os agendamentos não serão mais sincronizados automaticamente.'
			)
		) {
			return
		}

		setDisconnecting(true)
		setMessage(null)

		try {
			const response = await fetch('/api/google/oauth/disconnect', {
				method: 'POST',
			})

			if (!response.ok) {
				throw new Error('Failed to disconnect')
			}

			setMessage({ type: 'success', text: 'Google Calendar desconectado' })
			await fetchIntegration()
		} catch (err) {
			console.error('Error disconnecting:', err)
			setMessage({ type: 'error', text: 'Erro ao desconectar Google Calendar' })
		} finally {
			setDisconnecting(false)
		}
	}

	const handleSaveGestaoDS = async () => {
		setSavingGestaoDs(true)
		setMessage(null)

		try {
			const response = await fetch('/api/integrations/gestaods', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					enabled: gestaoDsEnabled,
					isDev: gestaoDsIsDev,
					apiToken: gestaoDsToken || undefined,
				}),
			})

			const data = await response.json()
			if (!response.ok) {
				throw new Error(data?.error || 'Falha ao salvar GestãoDS')
			}

			setGestaoDsHasToken(!!data.hasToken)
			setGestaoDsToken('')
			setMessage({ type: 'success', text: 'Configuração GestãoDS atualizada.' })
		} catch (err) {
			setMessage({
				type: 'error',
				text: err instanceof Error ? err.message : 'Erro ao salvar GestãoDS',
			})
		} finally {
			setSavingGestaoDs(false)
		}
	}

	const handleDisableGestaoDS = async () => {
		setSavingGestaoDs(true)
		setMessage(null)

		try {
			const response = await fetch('/api/integrations/gestaods', { method: 'DELETE' })
			if (!response.ok) {
				throw new Error('Falha ao desativar GestãoDS')
			}

			setGestaoDsEnabled(false)
			setGestaoDsSyncError(null)
			setMessage({ type: 'success', text: 'GestãoDS desativado.' })
		} catch (err) {
			setMessage({
				type: 'error',
				text: err instanceof Error ? err.message : 'Erro ao desativar GestãoDS',
			})
		} finally {
			setSavingGestaoDs(false)
		}
	}

	const handleSyncGestaoDS = async () => {
		setSyncingGestaoDs(true)
		setMessage(null)

		try {
			const response = await fetch('/api/integrations/gestaods/sync', { method: 'POST' })
			const data = await response.json().catch(() => null)

			if (!response.ok) {
				throw new Error(data?.error || 'Falha ao sincronizar GestãoDS')
			}

			const summary = data?.summary
			setMessage({
				type: 'success',
				text: `Sync concluído: ${summary?.created ?? 0} novos, ${summary?.updated ?? 0} atualizados.`,
			})
			await fetchGestaoDS()
		} catch (err) {
			setMessage({
				type: 'error',
				text: err instanceof Error ? err.message : 'Erro ao sincronizar GestãoDS',
			})
		} finally {
			setSyncingGestaoDs(false)
		}
	}

	const handleImportGestaoDS = async () => {
		if (
			!confirm(
				'Isso executará a importação inicial (histórico + futuros) da agenda GestãoDS. Deseja continuar?'
			)
		) {
			return
		}

		setImportingGestaoDs(true)
		setMessage(null)

		try {
			const response = await fetch('/api/integrations/gestaods/import', { method: 'POST' })
			const data = await response.json().catch(() => null)

			if (!response.ok) {
				throw new Error(data?.error || 'Falha ao executar importação inicial')
			}

			const summary = data?.summary
			setMessage({
				type: 'success',
				text: `Importação concluída: ${summary?.created ?? 0} novos, ${summary?.updated ?? 0} atualizados.`,
			})
			await fetchGestaoDS()
		} catch (err) {
			setMessage({
				type: 'error',
				text: err instanceof Error ? err.message : 'Erro na importação inicial GestãoDS',
			})
		} finally {
			setImportingGestaoDs(false)
		}
	}

	const handleDisableAllIntegrations = async () => {
		setDisablingAll(true)
		setMessage(null)

		try {
			if (integration?.is_connected) {
				await fetch('/api/google/oauth/disconnect', { method: 'POST' })
			}

			if (gestaoDsEnabled) {
				await fetch('/api/integrations/gestaods', { method: 'DELETE' })
				setGestaoDsEnabled(false)
			}

			await fetchIntegration()
			setMessage({ type: 'success', text: 'Integrações externas desativadas.' })
		} catch (err) {
			setMessage({
				type: 'error',
				text: err instanceof Error ? err.message : 'Erro ao desativar integrações',
			})
		} finally {
			setDisablingAll(false)
		}
	}

	if (loading) {
		return (
			<div className="animate-pulse">
				<div className="h-6 bg-neutral-200 rounded w-1/3 mb-4" />
				<div className="h-4 bg-neutral-200 rounded w-2/3 mb-6" />
				<div className="bg-white rounded-xl border border-neutral-200 p-4">
					<div className="h-4 bg-neutral-200 rounded w-1/4 mb-3" />
					<div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
					<div className="h-4 bg-neutral-200 rounded w-2/3" />
				</div>
			</div>
		)
	}

	const isConnected = integration?.is_connected ?? false
	const hasExternalIntegration = isConnected || gestaoDsEnabled

	return (
		<div className="space-y-4">
			{/* Mensagem de feedback */}
			{message && (
				<div
					className={`p-3 rounded-lg text-sm border ${{
						 success: 'bg-green-50 text-green-800 border-green-200',
						 error: 'bg-red-50 text-red-800 border-red-200',
					}[message.type]}`}
				>
					{message.text}
				</div>
			)}

			<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 flex items-center justify-between">
				<span>
					Modo atual: {hasExternalIntegration ? 'Integração externa ativa' : 'Sem integração (manual)'}
				</span>
				<button
					onClick={handleDisableAllIntegrations}
					disabled={disablingAll || !hasExternalIntegration}
					className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-medium hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{disablingAll ? 'Desativando...' : 'Desativar todas integrações'}
				</button>
			</div>

			{/* Card Google */}
			<div className="rounded-xl border border-neutral-200 bg-white">
				<div className="p-4 border-b border-neutral-200 flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold text-neutral-900">Google Calendar</h3>
						<p className="text-xs text-neutral-500 mt-1">
							Conecte sua conta do Google para criar eventos automaticamente.
						</p>
					</div>
					<div
						className={`px-3 py-1 rounded-full text-xs font-medium ${
							isConnected
								? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
								: 'bg-neutral-100 text-neutral-700 border border-neutral-200'
						}`}
					>
						{isConnected ? 'Conectado' : 'Desconectado'}
					</div>
				</div>

				<div className="p-4 space-y-3 text-sm text-neutral-700">
					{isConnected ? (
						<>
							<div>
								<span className="font-medium">Calendário: </span>
								<span>{integration?.google_calendar_id || 'primary'}</span>
							</div>
							<div>
								<span className="font-medium">Provider: </span>
								<span className="capitalize">{integration?.provider || 'Google'}</span>
							</div>
						</>
					) : (
						<p>
							Conecte sua conta do Google para sincronizar agendamentos automaticamente com o Google Calendar.
						</p>
					)}
				</div>

				<div className="p-4 border-t border-neutral-200 flex justify-end">
					{isConnected ? (
						<button
							onClick={handleDisconnect}
							disabled={disconnecting}
							className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{disconnecting ? 'Desconectando...' : 'Desconectar Google Calendar'}
						</button>
					) : (
						<button
							onClick={handleConnect}
							disabled={connecting}
							className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							{connecting ? 'Conectando...' : 'Conectar Google Calendar'}
						</button>
					)}
				</div>
			</div>

			{/* Card GestãoDS */}
			<div className="rounded-xl border border-neutral-200 bg-white">
				<div className="p-4 border-b border-neutral-200 flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold text-neutral-900">GestãoDS</h3>
						<p className="text-xs text-neutral-500 mt-1">
							Configure token/API e habilite a integração para sincronização.
						</p>
					</div>
					<div
						className={`px-3 py-1 rounded-full text-xs font-medium ${
							gestaoDsEnabled
								? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
								: 'bg-neutral-100 text-neutral-700 border border-neutral-200'
						}`}
					>
						{gestaoDsEnabled ? 'Ativo' : 'Inativo'}
					</div>
				</div>

				<div className="p-4 space-y-3 text-sm text-neutral-700">
					<div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
						<div>
							<p className="text-sm font-medium text-neutral-800">Habilitar GestãoDS</p>
							<p className="text-xs text-neutral-500">Quando ativo, o sistema poderá sincronizar agenda via GestãoDS.</p>
						</div>
						<button
							type="button"
							onClick={() => setGestaoDsEnabled((prev) => !prev)}
							className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
								gestaoDsEnabled ? 'bg-sky-600' : 'bg-neutral-300'
							}`}
						>
							<span
								className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
									gestaoDsEnabled ? 'translate-x-5' : 'translate-x-1'
								}`}
							/>
						</button>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1">Ambiente</label>
							<select
								value={gestaoDsIsDev ? 'dev' : 'prod'}
								onChange={(e) => setGestaoDsIsDev(e.target.value === 'dev')}
						className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
							>
								<option value="dev">Desenvolvimento (apidev)</option>
								<option value="prod">Produção</option>
							</select>
						</div>
						<div>
							<label className="block text-xs font-medium text-neutral-700 mb-1">
								Token API {gestaoDsHasToken ? '(token salvo)' : '(obrigatório)'}
							</label>
							<input
								type="password"
								value={gestaoDsToken}
								onChange={(e) => setGestaoDsToken(e.target.value)}
								placeholder={gestaoDsHasToken ? '••••••••••••••••' : 'Cole seu token GestãoDS'}
						className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
							/>
						</div>
					</div>

					<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-1.5 text-xs text-neutral-700">
						<p>
							<span className="font-medium">Última sincronização:</span>{' '}
							{gestaoDsLastSyncAt
								? new Date(gestaoDsLastSyncAt).toLocaleString('pt-BR')
								: 'Nunca'}
						</p>
						<p>
							<span className="font-medium">Saúde da integração:</span>{' '}
							{gestaoDsSyncError ? 'Com erro recente' : 'Sem erros recentes'}
						</p>
						{gestaoDsSyncError && (
							<p className="text-red-700">Erro: {gestaoDsSyncError}</p>
						)}
					</div>
				</div>

				<div className="p-4 border-t border-neutral-200 flex items-center justify-end gap-2 flex-wrap">
					<button
						onClick={handleSyncGestaoDS}
						disabled={syncingGestaoDs || !gestaoDsEnabled}
						className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
					>
						{syncingGestaoDs ? 'Sincronizando...' : 'Sincronizar agora'}
					</button>
					<button
						onClick={handleImportGestaoDS}
						disabled={importingGestaoDs || !gestaoDsEnabled}
						className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
					>
						{importingGestaoDs ? 'Importando...' : 'Importação inicial'}
					</button>
					<button
						onClick={handleDisableGestaoDS}
						disabled={savingGestaoDs || !gestaoDsEnabled}
						className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
					>
						Desativar GestãoDS
					</button>
					<button
						onClick={handleSaveGestaoDS}
						disabled={savingGestaoDs}
						className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
					>
						{savingGestaoDs ? 'Salvando...' : 'Salvar GestãoDS'}
					</button>
				</div>
			</div>

			{/* Info */}
			<div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-xs text-sky-900 space-y-1.5">
				<p className="font-semibold">Como funciona:</p>
				<p>1. Ao marcar uma conversa como "Agendado", criamos um evento no seu Google Calendar.</p>
				<p>2. O evento inclui nome do paciente, telefone e horário da consulta.</p>
				<p>3. Se GestãoDS estiver ativo, o roteador de integração pode usar GestãoDS como provedor.</p>
			</div>
		</div>
	)
}
