import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import PwaBootstrap from '@/components/pwa/PwaBootstrap'
import './globals.css'

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
})

export const metadata: Metadata = {
	title: {
		default: 'Doctor Chat Bot',
		template: '%s | Doctor Chat Bot',
	},
	manifest: '/manifest.webmanifest',
	applicationName: 'Doctor Chat Bot',
	description: 'Sistema inteligente de atendimento por WhatsApp para clínicas médicas',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Doctor Chat Bot',
	},
	formatDetection: {
		telephone: false,
	},
	icons: {
		icon: [{ url: '/brand.png', type: 'image/png' }],
		shortcut: [{ url: '/brand.png', type: 'image/png' }],
		apple: [{ url: '/brand.png', type: 'image/png' }],
	},
}

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	viewportFit: 'cover',
	themeColor: '#0A84FF',
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
				suppressHydrationWarning
			>
				<PwaBootstrap />
				{children}
			</body>
		</html>
	)
}
