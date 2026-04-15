const CACHE_NAME = 'doctor-chat-bot-shell-v1'
const PRECACHE_URLS = ['/brand.png', '/pwa-192.png', '/pwa-512.png', '/manifest.webmanifest']
const CACHEABLE_DESTINATIONS = new Set(['document', 'style', 'script', 'font', 'image', 'manifest'])

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.catch((error) => {
				console.error('[SW] Failed to precache shell assets:', error)
			}),
	)
	self.skipWaiting()
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
		),
	)
	self.clients.claim()
})

self.addEventListener('fetch', (event) => {
	const { request } = event
	if (request.method !== 'GET') return

	const url = new URL(request.url)
	if (url.origin !== self.location.origin) return
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/webpack-hmr')) return

	const destination = request.destination || 'document'
	if (!CACHEABLE_DESTINATIONS.has(destination)) return

	if (destination === 'document') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const clonedResponse = response.clone()
					void caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse))
					return response
				})
				.catch(async () => {
					const cached = await caches.match(request)
					return cached || Response.error()
				}),
		)
		return
	}

	event.respondWith(
		caches.match(request).then((cachedResponse) => {
			const networkFetch = fetch(request)
				.then((response) => {
					const clonedResponse = response.clone()
					void caches.open(CACHE_NAME).then((cache) => cache.put(request, clonedResponse))
					return response
				})
				.catch(() => cachedResponse)

			return cachedResponse || networkFetch
		}),
	)
})

self.addEventListener('push', (event) => {
	let payload = {}
	try {
		payload = event.data ? event.data.json() : {}
	} catch (error) {
		console.error('[SW] Failed to parse push payload:', error)
	}

	const title = payload.title || 'Doctor Chat Bot'
	const body = payload.body || 'Você recebeu uma nova atualização.'
	const url = payload.url || '/dashboard/conversas'
	const tag = payload.tag || 'doctor-chat-bot-notification'

	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			tag,
			badge: '/pwa-192.png',
			icon: '/pwa-192.png',
			data: {
				url,
			},
		}),
	)
})

self.addEventListener('notificationclick', (event) => {
	event.notification.close()

	const targetUrl =
		event.notification.data && event.notification.data.url
			? event.notification.data.url
			: '/dashboard/conversas'

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if ('focus' in client) {
					client.navigate(targetUrl)
					return client.focus()
				}
			}

			if (self.clients.openWindow) {
				return self.clients.openWindow(targetUrl)
			}

			return undefined
		}),
	)
})
