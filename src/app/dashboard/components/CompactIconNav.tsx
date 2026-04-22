import Link from 'next/link'
import { LayoutDashboard, MessageSquare, Calendar, Users, Settings } from 'lucide-react'

type CompactIconNavTab = 'conversas' | 'agenda'

interface CompactIconNavProps {
  activeTab: CompactIconNavTab
}

export default function CompactIconNav({ activeTab }: CompactIconNavProps) {
  return (
    <nav className="hidden md:flex flex-col items-center justify-between w-[56px] shrink-0 bg-[#f0f2f5] border-r border-neutral-200 py-3">
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/dashboard"
          className="flex items-center justify-center rounded-xl p-2.5 text-neutral-500 transition-colors hover:bg-neutral-200"
          title="Dashboard"
        >
          <LayoutDashboard className="size-5" />
        </Link>

        {activeTab === 'conversas' ? (
          <span
            className="flex items-center justify-center rounded-xl p-2.5 bg-white text-sky-600 shadow-sm"
            title="Conversas"
          >
            <MessageSquare className="size-5" />
          </span>
        ) : (
          <Link
            href="/dashboard/conversas"
            className="flex items-center justify-center rounded-xl p-2.5 text-neutral-500 transition-colors hover:bg-neutral-200"
            title="Conversas"
          >
            <MessageSquare className="size-5" />
          </Link>
        )}

        {activeTab === 'agenda' ? (
          <span
            className="flex items-center justify-center rounded-xl p-2.5 bg-white text-sky-600 shadow-sm"
            title="Agenda"
          >
            <Calendar className="size-5" />
          </span>
        ) : (
          <Link
            href="/dashboard/agenda"
            className="flex items-center justify-center rounded-xl p-2.5 text-neutral-500 transition-colors hover:bg-neutral-200"
            title="Agenda"
          >
            <Calendar className="size-5" />
          </Link>
        )}

        <Link
          href="/dashboard/lista-espera"
          className="flex items-center justify-center rounded-xl p-2.5 text-neutral-500 transition-colors hover:bg-neutral-200"
          title="Lista de Espera"
        >
          <Users className="size-5" />
        </Link>
      </div>

      <div className="flex flex-col items-center gap-1">
        <Link
          href="/dashboard/configuracoes"
          className="flex items-center justify-center rounded-xl p-2.5 text-neutral-500 transition-colors hover:bg-neutral-200"
          title="Configurações"
        >
          <Settings className="size-5" />
        </Link>
      </div>
    </nav>
  )
}
