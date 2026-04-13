'use client'

import { useState, useMemo } from 'react'
import { MessageSquare } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewProps {
  welcomeMessage: string
  menuMessage: string
  outOfHoursMessage: string
  fallbackMessage: string
  confirmScheduleMessage: string
  confirmRescheduleMessage: string
  confirmCancelMessage: string
}

interface WaMessage {
  sender: 'bot' | 'patient'
  text: string
  choices?: string[]       // becomes button-list (≤3) or option-list (>3)
  isOptionList?: boolean   // forces list picker mode
}

interface Scene {
  id: string
  label: string
  description: string
  messages: WaMessage[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize "1️⃣" → "1. " so the separator regex works */
function normalizeEmojiNumbers(s: string): string {
  return s.replace(/(\d+)\uFE0F?\u20E3/g, '$1. ')
}

/** Extract numbered choices from message text, return {text, choices} */
function splitTextAndChoices(raw: string): { text: string; choices: string[] } {
  const choiceRegex = /^(\d+)[.):-]\s+(.+)$/
  const lines = raw
    .split('\n')
    .map((l) => normalizeEmojiNumbers(l.trim()))
    .filter(Boolean)

  const choices: string[] = []
  const textLines: string[] = []

  for (const line of lines) {
    const m = line.match(choiceRegex)
    if (m) {
      choices.push(m[2].trim())
    } else {
      textLines.push(line)
    }
  }

  return { text: textLines.join('\n'), choices }
}

/** Render WhatsApp *bold* and _italic_ inline */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('*') && part.endsWith('*'))
          return <strong key={i}>{part.slice(1, -1)}</strong>
        if (part.startsWith('_') && part.endsWith('_'))
          return <em key={i}>{part.slice(1, -1)}</em>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// WhatsApp bubble components
// ---------------------------------------------------------------------------

/** Bot bubble — plain text, no interactivity */
function BotTextBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start px-2">
      <div className="relative max-w-[80%]">
        {/* Triangle pointer */}
        <div className="absolute -left-[6px] top-0 w-0 h-0 border-t-[8px] border-t-white border-r-[6px] border-r-transparent" />
        <div className="bg-white rounded-lg rounded-tl-none px-3 pt-2 pb-1.5 shadow-sm">
          <p className="text-[13.5px] text-neutral-800 leading-[1.4] whitespace-pre-wrap break-words">
            <WaText text={text} />
          </p>
          <p className="text-[10px] text-neutral-400 text-right mt-0.5">agora</p>
        </div>
      </div>
    </div>
  )
}

/** Bot bubble with interactive button-list (≤3 choices) */
function BotButtonListBubble({ text, choices }: { text: string; choices: string[] }) {
  return (
    <div className="flex justify-start px-2">
      <div className="relative max-w-[80%] w-full">
        <div className="absolute -left-[6px] top-0 w-0 h-0 border-t-[8px] border-t-white border-r-[6px] border-r-transparent" />
        <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden">
          {/* Message text */}
          <div className="px-3 pt-2 pb-1.5">
            <p className="text-[13.5px] text-neutral-800 leading-[1.4] whitespace-pre-wrap break-words">
              <WaText text={text} />
            </p>
            <p className="text-[10px] text-neutral-400 text-right mt-0.5">agora</p>
          </div>
          {/* Divider */}
          <div className="h-px bg-neutral-100" />
          {/* Buttons */}
          {choices.map((choice, i) => (
            <div key={i}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-[13px] font-medium text-[#00a884] text-center hover:bg-neutral-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="text-base">⊙</span>
                {choice}
              </button>
              {i < choices.length - 1 && <div className="h-px bg-neutral-100" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Bot bubble with interactive option-list (>3 choices → "Ver opções" button) */
function BotOptionListBubble({
  text,
  choices,
  listTitle = 'Opções disponíveis',
}: {
  text: string
  choices: string[]
  listTitle?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex justify-start px-2">
      <div className="relative max-w-[80%] w-full">
        <div className="absolute -left-[6px] top-0 w-0 h-0 border-t-[8px] border-t-white border-r-[6px] border-r-transparent" />
        <div className="bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden">
          {/* Message text */}
          <div className="px-3 pt-2 pb-1.5">
            <p className="text-[13.5px] text-neutral-800 leading-[1.4] whitespace-pre-wrap break-words">
              <WaText text={text} />
            </p>
            <p className="text-[10px] text-neutral-400 text-right mt-0.5">agora</p>
          </div>
          {/* Divider */}
          <div className="h-px bg-neutral-100" />
          {/* "Ver opções" button */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full px-3 py-2.5 text-[13px] font-medium text-[#00a884] flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors"
          >
            <span className="text-base leading-none">☰</span>
            <span>Ver opções</span>
          </button>
        </div>

        {/* Expanded list (simulates the list picker sheet) */}
        {open && (
          <div className="mt-1 bg-white rounded-lg shadow-lg overflow-hidden border border-neutral-100">
            <div className="px-3 py-2 border-b border-neutral-100">
              <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                {listTitle}
              </p>
            </div>
            {choices.map((choice, i) => (
              <div key={i}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-[13px] text-neutral-800 text-left flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                >
                  <span className="flex-1">{choice}</span>
                  <span className="text-[#00a884] text-xs">○</span>
                </button>
                {i < choices.length - 1 && <div className="h-px bg-neutral-100" />}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full px-3 py-2.5 text-[12px] text-neutral-400 text-center border-t border-neutral-100"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Patient text bubble (right side) */
function PatientBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end px-2">
      <div className="relative max-w-[80%]">
        <div className="absolute -right-[6px] top-0 w-0 h-0 border-t-[8px] border-t-[#d9fdd3] border-l-[6px] border-l-transparent" />
        <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none px-3 pt-2 pb-1.5 shadow-sm">
          <p className="text-[13.5px] text-neutral-800 leading-[1.4]">{text}</p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <p className="text-[10px] text-neutral-500">agora</p>
            <span className="text-[10px] text-[#53bdeb]">✓✓</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Renders a WaMessage */
function WaMessageBubble({ msg }: { msg: WaMessage }) {
  if (msg.sender === 'patient') return <PatientBubble text={msg.text} />

  if (!msg.choices || msg.choices.length < 2) {
    return <BotTextBubble text={msg.text} />
  }

  if (msg.choices.length <= 3) {
    return <BotButtonListBubble text={msg.text} choices={msg.choices} />
  }

  return (
    <BotOptionListBubble
      text={msg.text}
      choices={msg.choices}
      listTitle="Opções disponíveis"
    />
  )
}

// ---------------------------------------------------------------------------
// Main preview component
// ---------------------------------------------------------------------------

export default function BotWhatsAppPreview({
  welcomeMessage,
  menuMessage,
  outOfHoursMessage,
  fallbackMessage,
  confirmScheduleMessage,
  confirmRescheduleMessage,
  confirmCancelMessage,
}: PreviewProps) {
  const [activeScene, setActiveScene] = useState('menu')

  // Build scenes dynamically from current message values
  const scenes = useMemo((): Scene[] => {
    // Parse menu message → extract text header + choices
    const menuRaw = menuMessage || 'Como posso te ajudar hoje?\n\n1️⃣ Agendar consulta\n2️⃣ Remarcar consulta\n3️⃣ Cancelar consulta\n4️⃣ Falar com atendente\n5️⃣ Ver meus agendamentos'
    const menu = splitTextAndChoices(menuRaw)

    const fallback = splitTextAndChoices(
      fallbackMessage || 'Não entendi sua mensagem. O que você deseja fazer?\n\n1️⃣ Agendar consulta\n2️⃣ Remarcar consulta\n3️⃣ Cancelar consulta\n4️⃣ Falar com atendente\n5️⃣ Ver meus agendamentos'
    )

    return [
      {
        id: 'menu',
        label: 'Menu principal',
        description: 'Primeiro contato — boas-vindas + menu interativo',
        messages: [
          { sender: 'patient', text: 'Oi' },
          ...(welcomeMessage ? [{ sender: 'bot' as const, text: welcomeMessage }] : []),
          {
            sender: 'bot',
            text: menu.text || 'Escolha uma opção:',
            choices: menu.choices.length >= 2 ? menu.choices : undefined,
          },
        ],
      },
      {
        id: 'agendamento',
        label: 'Agendar',
        description: 'Fluxo de agendamento de nova consulta',
        messages: [
          { sender: 'patient', text: 'Quero agendar uma consulta' },
          { sender: 'bot', text: 'Ótimo! Vou agendar sua consulta. 😊\n\nPor favor, me informe seu *nome completo*:' },
          { sender: 'patient', text: 'Maria Silva' },
          { sender: 'bot', text: 'Obrigado, *Maria Silva*! 👍\n\nQual dia você prefere?\nPode digitar a data (ex: 25/04) ou o dia da semana.' },
          { sender: 'patient', text: 'terça-feira' },
          { sender: 'bot', text: 'Perfeito! Anotei o dia *terça-feira*.\n\nQual horário você prefere?\n(ex: 14h, 14:30)' },
          { sender: 'patient', text: '14h' },
          {
            sender: 'bot',
            text: 'Horário ocupado. Escolha um horário disponível:',
            choices: ['Ter 14h30', 'Ter 15h00', 'Ter 16h00', 'Qua 09h00', 'Qua 14h00'],
          },
        ],
      },
      {
        id: 'cancelar',
        label: 'Cancelar',
        description: 'Confirmação de cancelamento de consulta',
        messages: [
          { sender: 'patient', text: 'Quero cancelar minha consulta' },
          {
            sender: 'bot',
            text: 'Você deseja *cancelar* a consulta do dia:\n📅 Ter 22/04 às 14h00',
            choices: ['Sim, cancelar', 'Não, manter'],
          },
          { sender: 'patient', text: 'Sim, cancelar' },
          { sender: 'bot', text: confirmCancelMessage || '✅ Consulta cancelada.\n\nSe precisar agendar novamente, é só chamar! 😊' },
        ],
      },
      {
        id: 'confirmacao',
        label: 'Confirmações',
        description: 'Mensagem enviada após agendar, remarcar ou cancelar',
        messages: [
          { sender: 'bot', text: '✅ *Consulta agendada!*' },
          { sender: 'bot', text: confirmScheduleMessage || '✅ Consulta agendada com sucesso!\n\nFicamos felizes em atendê-lo(a). Até lá! 😊' },
          { sender: 'bot', text: '─────' },
          { sender: 'bot', text: confirmRescheduleMessage || '✅ Consulta remarcada com sucesso!\n\nAté lá! 😊' },
        ],
      },
      {
        id: 'forahorario',
        label: 'Fora do horário',
        description: 'Enviada quando o bot recebe mensagem fora do expediente',
        messages: [
          { sender: 'patient', text: 'Olá, preciso agendar' },
          {
            sender: 'bot',
            text: outOfHoursMessage || '😕 Estamos fora do horário de atendimento agora.\n\nRetornaremos assim que a clínica abrir. Obrigado!',
          },
        ],
      },
      {
        id: 'fallback',
        label: 'Não entendeu',
        description: 'Exibido quando o bot não compreende a mensagem',
        messages: [
          { sender: 'patient', text: 'qual o endereço?' },
          {
            sender: 'bot',
            text: fallback.text || 'Não entendi sua mensagem.',
            choices: fallback.choices.length >= 2 ? fallback.choices : undefined,
          },
        ],
      },
    ]
  }, [welcomeMessage, menuMessage, outOfHoursMessage, fallbackMessage, confirmScheduleMessage, confirmRescheduleMessage, confirmCancelMessage])

  const currentScene = scenes.find((s) => s.id === activeScene) ?? scenes[0]

  return (
    <div className="flex flex-col gap-3">
      {/* Scene selector */}
      <div className="flex flex-wrap gap-1.5">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            onClick={() => setActiveScene(scene.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
              activeScene === scene.id
                ? 'bg-[#075e54] text-white border-[#075e54]'
                : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
            }`}
          >
            {scene.label}
          </button>
        ))}
      </div>

      {/* Scene description */}
      <p className="text-xs text-neutral-500 flex items-center gap-1.5">
        <MessageSquare className="size-3 shrink-0" />
        {currentScene.description}
      </p>

      {/* Phone mockup */}
      <div className="mx-auto w-full max-w-[320px] rounded-[28px] bg-neutral-800 p-2 shadow-2xl ring-1 ring-neutral-700">
        <div className="relative overflow-hidden rounded-[20px]">

          {/* WhatsApp header */}
          <div className="bg-[#075e54] px-3 py-2 flex items-center gap-2.5">
            {/* Back arrow */}
            <span className="text-white text-lg leading-none">‹</span>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-[#128c7e] flex items-center justify-center shrink-0">
              <span className="text-white text-sm">🤖</span>
            </div>
            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-semibold leading-tight truncate">
                Assistente da Clínica
              </p>
              <p className="text-[#b2dfdb] text-[10px] leading-tight">online</p>
            </div>
            {/* Icons */}
            <div className="flex gap-3 text-white text-sm">
              <span>⋯</span>
            </div>
          </div>

          {/* Chat area */}
          <div
            className="flex flex-col gap-2 py-3 overflow-y-auto"
            style={{
              minHeight: '380px',
              maxHeight: '480px',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='300' height='300' fill='%23e5ddd5'/%3E%3C/svg%3E")`,
              backgroundColor: '#e5ddd5',
            }}
          >
            {/* Date separator */}
            <div className="flex justify-center">
              <span className="bg-white/80 text-neutral-500 text-[10px] px-2.5 py-0.5 rounded-full shadow-sm">
                Hoje
              </span>
            </div>

            {/* Messages */}
            {currentScene.messages.map((msg, i) => (
              <WaMessageBubble key={i} msg={msg} />
            ))}
          </div>

          {/* Input bar */}
          <div className="bg-[#f0f0f0] px-2 py-2 flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full px-3 py-1.5 flex items-center">
              <span className="text-neutral-400 text-[12px]">Mensagem</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#075e54] flex items-center justify-center shrink-0">
              <span className="text-white text-xs">🎤</span>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center text-[11px] text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded bg-white border border-neutral-200" />
          Bot
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded bg-[#d9fdd3] border border-neutral-200" />
          Paciente
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[#00a884] font-bold">☰</span>
          Lista interativa
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[#00a884] font-bold">⊙</span>
          Botão
        </span>
      </div>
    </div>
  )
}
