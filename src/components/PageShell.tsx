import type { ReactNode } from 'react'

export default function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-50">
			<div className="pointer-events-none absolute -left-24 -top-24 size-60 sm:size-72 rounded-full bg-sky-200/50 blur-3xl float-slow" />
			<div className="pointer-events-none absolute -bottom-28 -right-28 size-72 sm:size-80 rounded-full bg-indigo-200/40 blur-3xl float" />
			<div className="pointer-events-none absolute left-1/2 top-8 size-40 sm:size-48 -translate-x-1/2 rounded-full bg-sky-200/30 blur-3xl float-fast" />
			{children}
		</div>
	)
}
