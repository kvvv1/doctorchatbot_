'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, Calendar, Settings, LayoutDashboard, X, ClipboardList } from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import Tooltip from './Tooltip'

interface SidebarProps {
	isMobileOpen: boolean
	isCollapsed: boolean
	onClose: () => void
}

const menuItems = [
	{
		name: 'Dashboard',
		href: '/dashboard',
		icon: LayoutDashboard,
	},
	{
		name: 'Conversas',
		href: '/dashboard/conversas',
		icon: MessageSquare,
	},
	{
		name: 'Agenda',
		href: '/dashboard/agenda',
		icon: Calendar,
	},
	{
		name: 'Lista de Espera',
		href: '/dashboard/lista-de-espera',
		icon: ClipboardList,
	},
	{
		name: 'Configurações',
		href: '/dashboard/configuracoes',
		icon: Settings,
	},
]

export default function Sidebar({ isMobileOpen, isCollapsed, onClose }: SidebarProps) {
	const pathname = usePathname()

	return (
		<>
			{/* Mobile overlay */}
			{isMobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 lg:hidden"
					onClick={onClose}
				/>
			)}

			{/* Sidebar */}
			<aside
				className={`
					safe-top fixed inset-y-0 left-0 z-50 transform border-r border-neutral-200 bg-white transition-all duration-300 ease-in-out lg:static lg:z-0 lg:translate-x-0 overflow-x-hidden
					${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
					${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
					w-64
				`}
			>
				<div className="flex h-full flex-col overflow-x-hidden">
					{/* Logo */}
					<div className={`flex h-16 items-center border-b border-neutral-200 transition-all duration-300 overflow-hidden ${isCollapsed ? 'justify-center px-4' : 'justify-between px-6'}`}>
						<div className={`flex items-center transition-all duration-300 overflow-hidden ${isCollapsed ? 'gap-0' : 'gap-3'}`}>
							<BrandMark />
							<span className={`text-lg font-semibold text-neutral-900 transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
								Doctor Chat
							</span>
						</div>
						<button
							onClick={onClose}
							className="lg:hidden text-neutral-500 hover:text-neutral-700"
						>
							<X className="size-5" />
						</button>
					</div>

					{/* Navigation */}
					<nav className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'p-2' : 'p-4'}`}>
						{menuItems.map((item) => {
							const Icon = item.icon
							const isActive = item.href === '/dashboard'
								? pathname === item.href
								: pathname.startsWith(item.href)
							const linkContent = (
								<Link
									key={item.href}
									href={item.href}
									onClick={onClose}
									className={`
										flex items-center rounded-lg text-sm font-medium transition-all duration-300 overflow-hidden
										${isCollapsed ? 'justify-center px-4 py-3' : 'gap-3 px-4 py-3'}
										${
											isActive
												? 'bg-sky-50 text-sky-700'
												: 'text-neutral-700 hover:bg-neutral-100'
										}
									`}
								>
									<Icon className="size-5 flex-shrink-0" />
									<span className={`transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
										{item.name}
									</span>
								</Link>
							)

							return isCollapsed ? (
								<Tooltip key={item.href} content={item.name} side="right">
									{linkContent}
								</Tooltip>
							) : (
								linkContent
							)
						})}
					</nav>

					{/* Footer */}
					<div className={`border-t border-neutral-200 p-4 transition-all duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
						<p className="text-xs text-neutral-500 text-center">
							© 2026 Doctor Chat Bot
						</p>
					</div>
				</div>
			</aside>
		</>
	)
}
