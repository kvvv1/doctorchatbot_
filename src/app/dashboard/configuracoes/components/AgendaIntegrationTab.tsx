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
	const [loading, setLoading] = useState(true)
	const [connecting, setConnecting] = useState(false)
	const [disconnecting, setDisconnecting] = useState(false)
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

			const { data, error } = await supabase
				.from('calendar_integrations')
				.select('*')
				.eq('clinic_id', clinicId)
				.single()

			if (error && error.code !== 'PGRST116') {
				console.error('Error fetching integration:', error)
				return
			}

			setIntegration(data)
		} catch (err) {
			console.error('Error fetching integration:', err)
		} finally {
			setLoading(false)
		}
	}, [clinicId])

	useEffect(() => {
		fetchIntegration()
	}, [fetchIntegration])

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

			{/* Card principal */}
			<div className="rounded-xl border border-neutral-200 bg-white">
				<div className="p-4 border-b border-neutral-200 flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold text-neutral-900">Status da Integração</h3>
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

			{/* Info */}
			<div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-xs text-sky-900 space-y-1.5">
				<p className="font-semibold">Como funciona:</p>
				<p>1. Ao marcar uma conversa como "Agendado", criamos um evento no seu Google Calendar.</p>
				<p>2. O evento inclui nome do paciente, telefone e horário da consulta.</p>
				<p>3. Você pode editar ou cancelar normalmente pelo Google Calendar.</p>
			</div>
		</div>
	)
}
