'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, Download, Smartphone, WifiOff } from 'lucide-react'

type BeforeInstallPromptEventLike = Event & {
	prompt: () => Promise<void>
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function urlBase64ToUint8Array(base64String: string) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
	const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
	const rawData = window.atob(base64)
	return Uint8Array.from(rawData, (character) => character.charCodeAt(0))
}

export default function MobileInboxPwaBar() {
	const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEventLike | null>(null)
	const [isStandalone, setIsStandalone] = useState(false)
	const [isOnline, setIsOnline] = useState(true)
	const [busy, setBusy] = useState(false)
	const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
	const [isPushSubscribed, setIsPushSubscribed] = useState(false)
	const [showManualInstallHint, setShowManualInstallHint] = useState(false)
	const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

	const pushSupported = useMemo(() => {
		if (typeof window === 'undefined') return false
		return 'serviceWorker' in navigator && 'PushManager' in window && Boolean(vapidPublicKey)
	}, [vapidPublicKey])

	useEffect(() => {
		if (typeof window === 'undefined') return

		const syncStandaloneState = () => {
			const standaloneByDisplayMode = window.matchMedia('(display-mode: standalone)').matches
			const standaloneByNavigator = Boolean(
				(navigator as Navigator & { standalone?: boolean }).standalone,
			)
			setIsStandalone(standaloneByDisplayMode || standaloneByNavigator)
		}

		const syncPushState = async () => {
			if (!pushSupported) return

			try {
				const registration = await navigator.serviceWorker.ready
				const subscription = await registration.pushManager.getSubscription()
				setIsPushSubscribed(Boolean(subscription))
			} catch (error) {
				console.error('[MobileInboxPwaBar] Failed to sync push state:', error)
			}
		}

		syncStandaloneState()
		setIsOnline(navigator.onLine)
		if ('Notification' in window) {
			setPushPermission(Notification.permission)
		}
		void syncPushState()

		const handleInstallPrompt = (event: Event) => {
			event.preventDefault()
			setDeferredPrompt(event as BeforeInstallPromptEventLike)
		}

		const handleInstalled = () => {
			setDeferredPrompt(null)
			syncStandaloneState()
		}

		const handleOnline = () => setIsOnline(true)
		const handleOffline = () => setIsOnline(false)

		const isIosLike = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
		setShowManualInstallHint(isIosLike && !window.matchMedia('(display-mode: standalone)').matches)

		window.addEventListener('beforeinstallprompt', handleInstallPrompt)
		window.addEventListener('appinstalled', handleInstalled)
		window.addEventListener('online', handleOnline)
		window.addEventListener('offline', handleOffline)

		return () => {
			window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
			window.removeEventListener('appinstalled', handleInstalled)
			window.removeEventListener('online', handleOnline)
			window.removeEventListener('offline', handleOffline)
		}
	}, [pushSupported])

	const handleInstall = async () => {
		if (!deferredPrompt) return

		setBusy(true)
		try {
			await deferredPrompt.prompt()
			await deferredPrompt.userChoice
			setDeferredPrompt(null)
		} finally {
			setBusy(false)
		}
	}

	const handlePushToggle = async () => {
		if (!pushSupported || !vapidPublicKey) return

		setBusy(true)
		try {
			const registration = await navigator.serviceWorker.ready
			const existingSubscription = await registration.pushManager.getSubscription()

			if (existingSubscription) {
				const response = await fetch('/api/push/subscriptions', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ endpoint: existingSubscription.endpoint }),
				})

				if (!response.ok) {
					throw new Error('Falha ao remover inscrição de notificações')
				}

				await existingSubscription.unsubscribe()
				setIsPushSubscribed(false)
				return
			}

			if (!('Notification' in window)) {
				throw new Error('Notificações não são suportadas neste dispositivo')
			}

			const permission = await Notification.requestPermission()
			setPushPermission(permission)

			if (permission !== 'granted') {
				return
			}

			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
			})

			const payload = subscription.toJSON()
			if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
				throw new Error('Inscrição de notificações inválida')
			}

			const response = await fetch('/api/push/subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subscription: {
						endpoint: payload.endpoint,
						keys: payload.keys,
					},
				}),
			})

			if (!response.ok) {
				throw new Error('Falha ao salvar inscrição de notificações')
			}

			setIsPushSubscribed(true)
		} catch (error) {
			console.error('[MobileInboxPwaBar] Failed to toggle push subscription:', error)
		} finally {
			setBusy(false)
		}
	}

	if (isStandalone && isOnline && isPushSubscribed) {
		return null
	}

	return (
		<div className="mb-3 rounded-[26px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
						Inbox Mobile
					</p>
					<h2 className="mt-1 text-sm font-semibold text-neutral-900">
						Experiência de app, sem alterar o web
					</h2>
					<p className="mt-1 text-xs leading-relaxed text-neutral-500">
						{isOnline
							? 'Instale o app e ative alertas para responder mais rápido no celular.'
							: 'Você está offline. O histórico recente continua disponível enquanto a conexão volta.'}
					</p>
				</div>
				<div className="flex flex-wrap justify-end gap-2">
					{!isOnline && (
						<span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700">
							<WifiOff className="size-3" />
							Offline
						</span>
					)}
					{isStandalone && (
						<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
							<Smartphone className="size-3" />
							Instalado
						</span>
					)}
					{isPushSubscribed && (
						<span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
							<Bell className="size-3" />
							Alertas ativos
						</span>
					)}
				</div>
			</div>

			<div className="mt-3 flex flex-wrap gap-2">
				{!isStandalone && deferredPrompt && (
					<button
						type="button"
						onClick={() => void handleInstall()}
						disabled={busy}
						className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Download className="size-3.5" />
						Instalar app
					</button>
				)}

				{pushSupported && (
					<button
						type="button"
						onClick={() => void handlePushToggle()}
						disabled={busy || pushPermission === 'denied'}
						className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isPushSubscribed ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
						{isPushSubscribed ? 'Desativar alertas' : 'Ativar notificações'}
					</button>
				)}
			</div>

			{showManualInstallHint && !deferredPrompt && !isStandalone && (
				<p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
					No iPhone, use o menu do Safari e toque em “Adicionar à Tela de Início”.
				</p>
			)}

			{pushPermission === 'denied' && (
				<p className="mt-3 text-[11px] leading-relaxed text-amber-700">
					As notificações estão bloqueadas no navegador. Libere a permissão para receber novas mensagens em tempo real.
				</p>
			)}
		</div>
	)
}
