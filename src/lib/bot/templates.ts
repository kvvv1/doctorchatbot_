/**
 * Bot response templates in Brazilian Portuguese
 */

import type { AppointmentSummary, DayOption, Slot } from './context'

export const templates = {
  // -------------------------------------------------------------------------
  // Menu principal
  // -------------------------------------------------------------------------
  menu: `Olá! 👋 Sou o assistente virtual da clínica.

Como posso te ajudar hoje?

1️⃣ Agendar consulta
2️⃣ Ver meus agendamentos
3️⃣ Remarcar consulta
4️⃣ Cancelar consulta
5️⃣ Falar com atendente`,

  notUnderstood: `Não entendi sua mensagem. O que você deseja fazer?

1️⃣ Agendar consulta
2️⃣ Ver meus agendamentos
3️⃣ Remarcar consulta
4️⃣ Cancelar consulta
5️⃣ Falar com atendente`,

  // -------------------------------------------------------------------------
  // Agendamento
  // -------------------------------------------------------------------------
  scheduleAskName: `Ótimo! Vou agendar sua consulta. 😊

Por favor, me informe seu *nome completo*:`,

  scheduleAskCpf: (name: string) => `Obrigado, *${name}*! 👍

Agora preciso do seu *CPF* para confirmar o agendamento:
(ex: 123.456.789-00)`,

  appointmentsAskCpf: `Para localizar seus agendamentos, preciso do seu *CPF*:
(ex: 123.456.789-00)`,

  invalidCpf: `CPF invalido. Por favor, informe um CPF valido:
(ex: 123.456.789-00)`,

  scheduleChooseSlot: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return `Encontrei estes horários disponíveis para você:\n\n${lines}\n\nEscolha uma opção abaixo.`
  },

  scheduleAskDay: (name: string) =>
    `Obrigado, *${name}*! 👍

Qual dia você prefere para a consulta?
Pode digitar a data (ex: 25/04) ou o dia da semana (ex: segunda-feira).`,

  scheduleAskTime: (day: string) =>
    `Perfeito! Anotei o dia *${day}*.

Qual horário você prefere?
(ex: 14h, 14:30, 2 da tarde)`,

  scheduleConfirmSelection: (details: { dayLabel?: string; timeLabel: string; patientName?: string }) =>
    `Perfeito! Antes de confirmar, confira os dados:\n\n📅 Dia: ${details.dayLabel || 'Não informado'}\n🕐 Horário: ${details.timeLabel}\n👤 Paciente: ${details.patientName || 'Paciente'}\n\nEstá tudo correto?\n\n1️⃣ Sim, confirmar\n2️⃣ Não, alterar`,

  scheduleConflict: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return `⚠️ Este horário está ocupado. Escolha um horário disponível:\n\n${lines}`
  },

  scheduleNoSlots: `😕 Não encontrei horários disponíveis nos próximos dias.

Deseja falar com nossa equipe?

1️⃣ Sim, falar com atendente
2️⃣ Voltar ao menu`,

  // List-based scheduling flow (interactive lists)
  scheduleDayList: (days: DayOption[], hasMore: boolean) => {
    const lines = days.map((d, i) => `${i + 1}️⃣ ${d.label}`).join('\n')
    const moreOption = hasMore ? `\n${days.length + 1}️⃣ 📅 Ver mais datas` : ''
    return `📅 Escolha o dia da consulta:\n\n${lines}${moreOption}`
  },

  scheduleSlotList: (dayLabel: string, slots: Slot[], showBack: boolean) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    const backOption = showBack ? `\n${slots.length + 1}️⃣ ↩️ Outra data` : ''
    return `🕐 Horários disponíveis para *${dayLabel}*:\n\n${lines}${backOption}`
  },

  rescheduleDayList: (days: DayOption[], hasMore: boolean) => {
    const lines = days.map((d, i) => `${i + 1}️⃣ ${d.label}`).join('\n')
    const moreOption = hasMore ? `\n${days.length + 1}️⃣ 📅 Ver mais datas` : ''
    return `📅 Escolha o novo dia da consulta:\n\n${lines}${moreOption}`
  },

  rescheduleSlotList: (dayLabel: string, slots: Slot[], showBack: boolean) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    const backOption = showBack ? `\n${slots.length + 1}️⃣ ↩️ Outra data` : ''
    return `🕐 Horários disponíveis para *${dayLabel}*:\n\n${lines}${backOption}`
  },

  // -------------------------------------------------------------------------
  // Reagendamento
  // -------------------------------------------------------------------------
  rescheduleAskDay: `Entendido! Vou remarcar sua consulta.

Qual o *novo dia* desejado?
(ex: 28/04 ou quinta-feira)`,

  rescheduleChooseSlot: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return `Escolha o novo horário da sua consulta:\n\n${lines}\n\nSelecione uma opção abaixo.`
  },

  rescheduleAskTime: (day: string) =>
    `Novo dia anotado: *${day}*

Qual o *novo horário*?
(ex: 15h, 15:30)`,

  rescheduleConflict: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return `⚠️ Este horário também está ocupado. Escolha um horário disponível:\n\n${lines}`
  },

  // -------------------------------------------------------------------------
  // Escolha de consulta (quando paciente tem mais de uma)
  // -------------------------------------------------------------------------
  whichAppointmentCancel: (appointments: AppointmentSummary[]) => {
    const lines = appointments.map((a, i) => `${i + 1}️⃣ ${a.label}`).join('\n')
    return `Encontrei ${appointments.length} consulta(s) agendada(s). Qual deseja *cancelar*?\n\n${lines}`
  },

  whichAppointmentReschedule: (appointments: AppointmentSummary[]) => {
    const lines = appointments.map((a, i) => `${i + 1}️⃣ ${a.label}`).join('\n')
    return `Encontrei ${appointments.length} consulta(s) agendada(s). Qual deseja *remarcar*?\n\n${lines}`
  },

  invalidChoice: (max: number) =>
    `Por favor, escolha uma das opções disponíveis (1 a ${max}).`,

  // -------------------------------------------------------------------------
  // Cancelamento
  // -------------------------------------------------------------------------
  cancelConfirmSingle: (label: string) =>
    `Você deseja *cancelar* a consulta do dia:\n📅 ${label}\n\n1️⃣ Sim, cancelar\n2️⃣ Não, manter`,

  cancelConfirmGeneric: `Você deseja *cancelar* sua consulta?\n\n1️⃣ Sim, cancelar\n2️⃣ Não, manter`,

  cancelAskWaitlist: `Consulta cancelada. ✅

Gostaria de entrar na *lista de espera* caso surja um horário mais cedo?

1️⃣ Sim, entrar na lista
2️⃣ Não, obrigado`,

  cancelWithWaitlist: `✅ Consulta cancelada com sucesso.

Você foi adicionado à *lista de espera*. Avisaremos assim que surgir um horário disponível! 📲`,

  cancelWithoutWaitlist: `✅ Consulta cancelada.

Se precisar agendar novamente no futuro, é só chamar! Obrigado. 😊`,

  cancelAborted: `Ok! Sua consulta está *mantida*. 👍

Posso ajudar em algo mais?`,

  cancelNoAppointments: `Não encontrei consultas agendadas para o seu número. 🔍

O que deseja fazer?

1️⃣ Agendar uma consulta
2️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Ver agendamentos
  // -------------------------------------------------------------------------
  viewAppointments: (appointments: AppointmentSummary[]) => {
    const lines = appointments
      .map((a, i) => `${i + 1}. 📅 ${a.label} — ${statusLabel(a.status)}`)
      .join('\n')

    return `Seus próximos agendamentos: 📋\n\n${lines}\n\nO que deseja fazer?\n\n1️⃣ Remarcar consulta\n2️⃣ Cancelar consulta\n3️⃣ Menu principal`
  },

  viewAppointmentsNotFound: `Não encontrei consultas agendadas para o seu número. 🔍

O que deseja fazer?

1️⃣ Agendar uma consulta
2️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Confirmar presença
  // -------------------------------------------------------------------------
  confirmAttendanceAsk: `Você tem consulta(s) agendada(s) nos próximos dias. *Confirma presença?*

1️⃣ Sim, confirmo
2️⃣ Não, preciso alterar`,

  confirmAttendanceSuccess: `✅ *Presença confirmada!*

Obrigado! Te esperamos. 🏥`,

  confirmAttendanceCancel: `Entendido. O que deseja fazer?

1️⃣ Remarcar consulta
2️⃣ Cancelar consulta
3️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Atendente humano
  // -------------------------------------------------------------------------
  attendantTransfer: `Certo! Vou transferir você para um de nossos *atendentes*. 👨‍⚕️

⏳ Aguarde um momento, alguém da nossa equipe entrará em contato em breve.`,

  attendantOutOfHours: `Nossos atendentes estão fora do horário agora. 😕

Posso ajudar com alguma dessas opções:

1️⃣ Agendar consulta pelo bot
2️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Erros genéricos
  // -------------------------------------------------------------------------
  technicalError: `Ops! Tive um problema técnico. Pode tentar novamente em instantes?

Se o problema persistir, use a opção *5 — Falar com atendente*.`,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '⏳ Aguardando confirmação',
    confirmed: '✅ Confirmada',
    scheduled: '✅ Agendada',
    canceled: '❌ Cancelada',
    waitlist: '📋 Lista de espera',
    done: '✔️ Realizada',
    completed: '✔️ Realizada',
    no_show: '🚫 Não compareceu',
  }
  return map[status] || status
}
