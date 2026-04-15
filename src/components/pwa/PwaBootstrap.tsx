'use client'

import { useEffect } from 'react'

export default function PwaBootstrap() {
	useEffect(() => {
		if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
			return
		}

		void navigator.serviceWorker.register('/sw.js').catch((error) => {
			console.error('[PWA] Failed to register service worker:', error)
		})
	}, [])

	return null
}
