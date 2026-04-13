/**
 * Bot response templates in Brazilian Portuguese
 */

import type { AppointmentSummary, Slot } from './context'

export const templates = {
  // -------------------------------------------------------------------------
  // Menu principal
  // -------------------------------------------------------------------------
  menu: `Olá! 👋 Sou o assistente virtual da clínica.

Como posso te ajudar hoje?

1️⃣ Agendar uma consulta
2️⃣ Remarcar consulta
3️⃣ Cancelar consulta
4️⃣ Falar com atendente
5️⃣ Ver meus agendamentos

Digite o número da opção ou descreva o que precisa. 😊`,

  notUnderstood: `Desculpe, não entendi. Por favor, escolha uma das opções:

1️⃣ Agendar consulta
2️⃣ Remarcar consulta
3️⃣ Cancelar consulta
4️⃣ Falar com atendente
5️⃣ Ver meus agendamentos`,

  // -------------------------------------------------------------------------
  // Agendamento
  // -------------------------------------------------------------------------
  scheduleAskName: `Ótimo! Vou agendar sua consulta. 😊

Por favor, me informe seu *nome completo*:`,

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

  scheduleConflict: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return `⚠️ Este horário já está ocupado. Temos disponível:\n\n${lines}\n\nDigite o número da opção desejada ou sugira outro horário.`
  },

  scheduleNoSlots: `😕 Não encontrei horários disponíveis nos próximos dias.
Entre em contato com nossa equipe para verificar disponibilidade.

4️⃣ Falar com atendente`,

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
    return `⚠️ Este horário também está ocupado. Temos disponível:\n\n${lines}\n\nDigite o número da opção desejada ou sugira outro horário.`
  },

  // -------------------------------------------------------------------------
  // Escolha de consulta (quando paciente tem mais de uma)
  // -------------------------------------------------------------------------
  whichAppointmentCancel: (appointments: AppointmentSummary[]) => {
    const lines = appointments.map((a, i) => `${i + 1}️⃣ ${a.label}`).join('\n')
    return `Encontrei ${appointments.length} consultas agendadas:\n\n${lines}\n\nQual delas você deseja *cancelar*? Digite o número.`
  },

  whichAppointmentReschedule: (appointments: AppointmentSummary[]) => {
    const lines = appointments.map((a, i) => `${i + 1}️⃣ ${a.label}`).join('\n')
    return `Encontrei ${appointments.length} consultas agendadas:\n\n${lines}\n\nQual delas você deseja *remarcar*? Digite o número.`
  },

  invalidChoice: (max: number) =>
    `Por favor, digite um número entre 1 e ${max}.`,

  // -------------------------------------------------------------------------
  // Cancelamento
  // -------------------------------------------------------------------------
  cancelConfirmSingle: (label: string) =>
    `Você deseja *cancelar* a consulta do dia:\n📅 ${label}\n\n1️⃣ Sim, cancelar\n2️⃣ Não, manter`,

  cancelConfirmGeneric: `Você deseja *cancelar* sua consulta?\n\n1️⃣ Sim, cancelar\n2️⃣ Não, manter`,

  cancelAskWaitlist: `Consulta cancelada. ✅

Gostaria de entrar na *lista de espera* caso surja um horário mais cedo?
\n1️⃣ Sim, entrar na lista\n2️⃣ Não, obrigado`,

  cancelWithWaitlist: `✅ Consulta cancelada com sucesso.

Você foi adicionado à *lista de espera*. Avisaremos assim que surgir um horário disponível! 📲`,

  cancelWithoutWaitlist: `✅ Consulta cancelada.

Se precisar agendar novamente no futuro, é só chamar! Obrigado. 😊`,

  cancelAborted: `Ok! Sua consulta está *mantida*. 👍

Posso ajudar em algo mais?`,

  cancelNoAppointments: `Não encontrei nenhuma consulta agendada para o seu número. 🔍

Gostaria de agendar uma consulta?

1️⃣ Sim, agendar agora
2️⃣ Não, obrigado`,

  // -------------------------------------------------------------------------
  // Ver agendamentos
  // -------------------------------------------------------------------------
  viewAppointments: (appointments: AppointmentSummary[]) => {
    const lines = appointments
      .map((a, i) => `${i + 1}. 📅 ${a.label} — ${statusLabel(a.status)}`)
      .join('\n')

    return `Seus próximos agendamentos: 📋\n\n${lines}\n\nPrecisa remarcar ou cancelar?\n1️⃣ Remarcar   2️⃣ Cancelar   3️⃣ Menu principal`
  },

  viewAppointmentsNotFound: `Não encontrei consultas agendadas para o seu número. 🔍

Gostaria de agendar uma nova consulta?

1️⃣ Sim, agendar agora
2️⃣ Não, obrigado`,

  // -------------------------------------------------------------------------
  // Confirmar presença
  // -------------------------------------------------------------------------
  confirmAttendanceAsk: `Para confirmar sua presença, você tem consulta(s) agendada(s) nos próximos dias.

*Confirma que comparecerá?*
1️⃣ Sim, confirmo\n2️⃣ Não, preciso alterar`,

  confirmAttendanceSuccess: `✅ *Presença confirmada!*

Obrigado por confirmar. Te esperamos! 🏥

Se precisar remarcar, é só avisar.`,

  confirmAttendanceCancel: `Entendido. Como posso ajudar?

1️⃣ Remarcar consulta
2️⃣ Cancelar consulta
3️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Atendente humano
  // -------------------------------------------------------------------------
  attendantTransfer: `Certo! Vou transferir você para um de nossos *atendentes*. 👨‍⚕️

⏳ Aguarde um momento, alguém da nossa equipe entrará em contato em breve.`,

  attendantOutOfHours: `Poxa, nossos atendentes estão *fora do horário* agora. 😕

Você pode:
1️⃣ Deixar uma mensagem — responderemos em breve
2️⃣ Usar o bot para agendar agora mesmo`,

  // -------------------------------------------------------------------------
  // Erros genéricos
  // -------------------------------------------------------------------------
  technicalError: `Ops! Tive um problema técnico. Pode tentar novamente em instantes?

Se o problema persistir, use a opção *4 — Falar com atendente*.`,
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
