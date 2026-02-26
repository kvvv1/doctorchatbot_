'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CalendarIntegration } from '@/lib/types/database'

export default function AgendaConfigPageClient() {
	const router = useRouter()
	const searchParams = useSearchParams()

	const [integration, setIntegration] = useState<CalendarIntegration | null>(
		null
	)
	const [loading, setLoading] = useState(true)
	const [connecting, setConnecting] = useState(false)
	const [disconnecting, setDisconnecting] = useState(false)
	const [message, setMessage] = useState<{
		type: 'success' | 'error'
		text: string
	} | null>(null)

	// Fetch integration status
	const fetchIntegration = useCallback(async () => {
		try {
			setLoading(true)
			const supabase = createClient()

			const {
				data: { user },
			} = await supabase.auth.getUser()
			if (!user) return

			const { data: profile } = await supabase
				.from('profiles')
				.select('clinic_id')
				.eq('id', user.id)
				.single()

			if (!profile) return

			const { data, error } = await supabase
				.from('calendar_integrations')
				.select('*')
				.eq('clinic_id', profile.clinic_id)
				.single()

			if (error && error.code !== 'PGRST116') {
				// PGRST116 = no rows returned
				console.error('Error fetching integration:', error)
				return
			}

			setIntegration(data)
		} catch (error) {
			console.error('Error fetching integration:', error)
		} finally {
			setLoading(false)
		}
	}, [])

	// Handle OAuth callback messages
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

			// Clean URL
			router.replace('/dashboard/configuracoes/agenda')
		}

		if (success === 'connected') {
			setMessage({
				type: 'success',
				text: 'Google Calendar conectado com sucesso!',
			})

			// Refresh integration data
			fetchIntegration()

			// Clean URL
			router.replace('/dashboard/configuracoes/agenda')
		}
	}, [searchParams, router, fetchIntegration])

	// Initial fetch
	useEffect(() => {
		fetchIntegration()
	}, [fetchIntegration])

	const handleConnect = async () => {
		setConnecting(true)
		setMessage(null)

		try {
			// Redirect to OAuth start route
			window.location.href = '/api/google/oauth/start'
		} catch (error) {
			console.error('Error connecting:', error)
			setMessage({
				type: 'error',
				text: 'Erro ao iniciar conexão',
			})
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

			setMessage({
				type: 'success',
				text: 'Google Calendar desconectado',
			})

			// Refresh integration data
			await fetchIntegration()
		} catch (error) {
			console.error('Error disconnecting:', error)
			setMessage({
				type: 'error',
				text: 'Erro ao desconectar Google Calendar',
			})
		} finally {
			setDisconnecting(false)
		}
	}

	if (loading) {
		return (
			<div className="p-6">
				<div className="max-w-3xl mx-auto">
					<div className="animate-pulse">
						<div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
						<div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
						<div className="bg-white rounded-lg shadow p-6">
							<div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
							<div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
							<div className="h-4 bg-gray-200 rounded w-2/3"></div>
						</div>
					</div>
				</div>
			</div>
		)
	}

	const isConnected = integration?.is_connected ?? false

	return (
		<div className="p-6">
			<div className="max-w-3xl mx-auto">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-2xl font-bold text-gray-900 mb-2">
						Configurações da Agenda
					</h1>
					<p className="text-gray-600">
						Configure a integração com o Google Calendar para criar eventos
						automaticamente quando marcar consultas como agendadas.
					</p>
				</div>

				{/* Message */}
				{message && (
					<div
						className={`mb-6 p-4 rounded-lg ${
							message.type === 'success'
								? 'bg-green-50 text-green-800 border border-green-200'
								: 'bg-red-50 text-red-800 border border-red-200'
						}`}
					>
						{message.text}
					</div>
				)}

				{/* Main Card */}
				<div className="bg-white rounded-lg shadow">
					{/* Status Section */}
					<div className="p-6 border-b border-gray-200">
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-lg font-semibold text-gray-900">
								Status da Integração
							</h2>
							<div
								className={`px-3 py-1 rounded-full text-sm font-medium ${
									isConnected
										? 'bg-green-100 text-green-800'
										: 'bg-gray-100 text-gray-800'
								}`}
							>
								{isConnected ? '✓ Conectado' : '○ Desconectado'}
							</div>
						</div>

						{isConnected ? (
							<div className="space-y-3">
								<div>
									<label className="text-sm font-medium text-gray-700">
										Calendário:
									</label>
									<p className="text-gray-900">
										{integration?.google_calendar_id || 'primary'}
									</p>
								</div>
								<div>
									<label className="text-sm font-medium text-gray-700">
										Provider:
									</label>
									<p className="text-gray-900 capitalize">
										{integration?.provider || 'Google'}
									</p>
								</div>
							</div>
						) : (
							<p className="text-gray-600">
								Conecte sua conta do Google para sincronizar agendamentos
								automaticamente com o Google Calendar.
							</p>
						)}
					</div>

					{/* Actions Section */}
					<div className="p-6">
						{isConnected ? (
							<button
								onClick={handleDisconnect}
								disabled={disconnecting}
								className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{disconnecting ? 'Desconectando...' : 'Desconectar Google Calendar'}
							</button>
						) : (
							<button
								onClick={handleConnect}
								disabled={connecting}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{connecting ? 'Conectando...' : 'Conectar Google Calendar'}
							</button>
						)}
					</div>
				</div>

				{/* Info Card */}
				<div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
					<h3 className="text-lg font-semibold text-blue-900 mb-3">
						Como funciona?
					</h3>
					<ul className="space-y-2 text-blue-800">
						<li className="flex items-start">
							<span className="mr-2">1.</span>
							<span>
								Conecte sua conta do Google Calendar clicando no botão acima
							</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2">2.</span>
							<span>
								Quando você marcar uma conversa como "Agendado", um evento será
								criado automaticamente no seu Google Calendar
							</span>
						</li>
						<li className="flex items-start">
							<span className="mr-2">3.</span>
							<span>
								O evento incluirá o nome do paciente, telefone e horário da
								consulta
							</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	)
}
