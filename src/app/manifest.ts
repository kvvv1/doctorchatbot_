import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: 'Doctor Chat Bot',
		short_name: 'Doctor Chat',
		description: 'Inbox de atendimento por WhatsApp para clínicas, otimizado para uso móvel.',
		start_url: '/dashboard/conversas',
		scope: '/',
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#f5f7fb',
		theme_color: '#0f766e',
		categories: ['medical', 'productivity', 'communication'],
		icons: [
			{
				src: '/pwa-192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/pwa-192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'maskable',
			},
			{
				src: '/pwa-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/pwa-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'maskable',
			},
		],
	}
}
