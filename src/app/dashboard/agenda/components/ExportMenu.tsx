/**
 * Export Menu Component
 * Dropdown menu for exporting appointments (iCal, CSV, etc.)
 */

'use client'

import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'

export function ExportMenu() {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleExportICal = async () => {
    try {
      setIsDownloading(true)
      const response = await fetch('/api/export/ical')
      
      if (!response.ok) {
        throw new Error('Erro ao exportar')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'agenda.ics'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Erro ao baixar iCal:', error)
      alert('Erro ao exportar agenda')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleExportCSV = async () => {
    try {
      setIsDownloading(true)
      const response = await fetch('/api/export/csv')
      
      if (!response.ok) {
        throw new Error('Erro ao exportar')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'agendamentos.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Erro ao baixar CSV:', error)
      alert('Erro ao exportar para CSV')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="relative inline-block text-left">
      <div className="group">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          disabled={isDownloading}
        >
          <DownloadIcon className="h-4 w-4" />
          {isDownloading ? 'Exportando...' : 'Exportar'}
        </button>

        {/* Dropdown Menu */}
        <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
          <div className="py-1" role="menu">
            <button
              onClick={handleExportICal}
              disabled={isDownloading}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
              role="menuitem"
            >
              <div className="flex items-center justify-between">
                <span>Exportar iCal (.ics)</span>
                <span className="text-xs text-gray-500">Apple, Google</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Importar para Apple Calendar, Google Calendar, Outlook
              </p>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={isDownloading}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
              role="menuitem"
            >
              <div className="flex items-center justify-between">
                <span>Exportar CSV</span>
                <span className="text-xs text-gray-500">Excel</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Abrir no Excel, Google Sheets ou outros
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
