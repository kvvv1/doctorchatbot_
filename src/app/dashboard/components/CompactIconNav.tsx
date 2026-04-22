'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LayoutDashboard, MessageSquare, Calendar, ClipboardList, Settings, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import BrandMark from '@/components/BrandMark'

type CompactIconNavTab = 'conversas' | 'agenda'

interface CompactIconNavProps {
  activeTab: CompactIconNavTab
}

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, tab: null },
  { name: 'Conversas', href: '/dashboard/conversas', icon: MessageSquare, tab: 'conversas' },
  { name: 'Agenda', href: '/dashboard/agenda', icon: Calendar, tab: 'agenda' },
  { name: 'Lista de Espera', href: '/dashboard/lista-de-espera', icon: ClipboardList, tab: null },
]

export default function CompactIconNav({ activeTab }: CompactIconNavProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('compactNavExpanded')
    if (saved !== null) setExpanded(saved === 'true')
  }, [])

  const toggle = () => {
    setExpanded((prev) => {
      localStorage.setItem('compactNavExpanded', String(!prev))
      return !prev
    })
  }

  return (
    <nav
      className={`hidden md:flex flex-col justify-between shrink-0 bg-[#f0f2f5] border-r border-neutral-200 py-3 transition-all duration-200 ease-in-out overflow-hidden ${
        expanded ? 'w-56' : 'w-[56px]'
      }`}
    >
      {/* Top section */}
      <div className="flex flex-col gap-1">
        {/* Toggle button */}
        <div className={`flex mb-1 ${expanded ? 'items-center justify-between px-3' : 'items-center justify-center'}`}>
          {expanded && (
            <div className="flex items-center gap-2 pl-1">
              <BrandMark />
              <span className="text-sm font-semibold whitespace-nowrap text-neutral-800">
                Doctor<span className="text-sky-600">ChatBot</span>
              </span>
            </div>
          )}
          <button
            onClick={toggle}
            className="flex items-center justify-center rounded-xl p-2.5 text-neutral-500 transition-colors hover:bg-neutral-200"
            title={expanded ? 'Recolher menu' : 'Expandir menu'}
          >
            {expanded ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </button>
        </div>

        {/* Nav items */}
        {menuItems.map((item) => {
          const isActive = item.tab === activeTab
          const Icon = item.icon
          const cls = `flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors ${
            isActive
              ? 'bg-white text-sky-600 shadow-sm'
              : 'text-neutral-500 hover:bg-neutral-200'
          } ${expanded ? 'mx-2' : 'mx-auto w-10 justify-center'}`

          return isActive ? (
            <span key={item.href} className={cls} title={item.name}>
              <Icon className="size-5 shrink-0" />
              {expanded && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
            </span>
          ) : (
            <Link key={item.href} href={item.href} className={cls} title={item.name}>
              <Icon className="size-5 shrink-0" />
              {expanded && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
            </Link>
          )
        })}
      </div>

      {/* Bottom section */}
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/configuracoes"
          className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-neutral-500 transition-colors hover:bg-neutral-200 ${
            expanded ? 'mx-2' : 'mx-auto w-10 justify-center'
          }`}
          title="Configurações"
        >
          <Settings className="size-5 shrink-0" />
          {expanded && <span className="text-sm font-medium whitespace-nowrap">Configurações</span>}
        </Link>
      </div>
    </nav>
  )
}
