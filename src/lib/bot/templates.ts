/**
 * Bot response templates in Brazilian Portuguese
 */

import type { AppointmentSummary, DayOption, Slot } from './context'

const MENU_BACK_OPTION = '\n\n0. 🏠 Menu principal'

function withMenuHint(message: string): string {
  return `${message}${MENU_BACK_OPTION}`
}

function withMenuOption(message: string, optionNumber: number, label = 'Voltar ao menu principal'): string {
  return `${message}\n${optionNumber}. ${label}`
}

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
5️⃣ Falar com secretária`,

  notUnderstood: `Não entendi sua mensagem. O que você deseja fazer?

1️⃣ Agendar consulta
2️⃣ Ver meus agendamentos
3️⃣ Remarcar consulta
4️⃣ Cancelar consulta
5️⃣ Falar com secretária`,

  // -------------------------------------------------------------------------
  // Tipo de atendimento (Particular / Convênio)
  // -------------------------------------------------------------------------
  askScheduleType: withMenuHint(`Vou agendar sua consulta! 😊

Seu atendimento será:

1️⃣ Particular
2️⃣ Convênio`),

  askRescheduleType: withMenuHint(`Certo! Para remarcar, me diga:

Seu atendimento é:

1️⃣ Particular
2️⃣ Convênio`),

  askCancelType: withMenuHint(`Entendido! Para cancelar, me diga:

Seu atendimento é:

1️⃣ Particular
2️⃣ Convênio`),

  particularTransfer: `Para consultas *Particulares*, nossa secretária cuida do agendamento pessoalmente. 👩‍⚕️

Vou te transferir agora!`,

  askConvenio: (convenios: string[]) => {
    const lines = convenios.map((name, i) => `${i + 1}️⃣ ${name}`).join('\n')
    return withMenuHint(`Qual é o seu convênio? 🏥\n\n${lines}`)
  },

  noConvenioConfigured: `No momento não temos convênios cadastrados. 😕

Como posso te ajudar?

1. 👩‍⚕️ Falar com a secretária
0. 🏠 Menu principal`,


  // Appended after the day-list message for convênio patients when particular days exist
  particularDaysHint: (daysLabel: string) =>
    `\n\n💡 *Precisa de atendimento mais urgente?* Oferecemos consultas *Particulares* às *${daysLabel}*. Fale com nossa secretária para verificar disponibilidade.`,

  // -------------------------------------------------------------------------
  // Agendamento
  // -------------------------------------------------------------------------
  scheduleAskName: withMenuHint(`Ótimo! Vou agendar sua consulta. 😊

Por favor, me informe seu *nome completo*:`),

  scheduleAskCpf: (name: string) => withMenuHint(`Obrigado, *${name}*! 👍

Agora preciso do seu *CPF* para confirmar o agendamento:
(ex: 123.456.789-00)`),

  appointmentsAskCpf: withMenuHint(`Para localizar seus agendamentos, preciso do seu *CPF*:
(ex: 123.456.789-00)`),

  invalidCpf: withMenuHint(`CPF invalido. Por favor, informe um CPF valido:
(ex: 123.456.789-00)`),

  scheduleChooseSlot: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return withMenuOption(`Encontrei estes horários disponíveis para você:\n\n${lines}\n\nEscolha uma opção abaixo.`, slots.length + 1)
  },

  scheduleAskDay: (name: string) => withMenuHint(
    `Obrigado, *${name}*! 👍

Qual dia você prefere para a consulta?
 Pode digitar a data (ex: 25/04) ou o dia da semana (ex: segunda-feira).`),

  scheduleAskTime: (day: string) => withMenuHint(
    `Perfeito! Anotei o dia *${day}*.

Qual horário você prefere?
 (ex: 14h, 14:30, 2 da tarde)`),

  scheduleConfirmSelection: (details: { dayLabel?: string; timeLabel: string; patientName?: string }) =>
    withMenuOption(
      `Perfeito! Antes de confirmar, confira os dados:\n\n📅 Dia: ${details.dayLabel || 'Não informado'}\n🕐 Horário: ${details.timeLabel}\n👤 Paciente: ${details.patientName || 'Paciente'}\n\nEstá tudo correto?\n\n1️⃣ Sim, confirmar\n2️⃣ Não, alterar`,
      3,
    ),

  scheduleChangeField: withMenuOption(
    `Sem problema. O que você deseja alterar?\n\n1️⃣ Data da consulta\n2️⃣ Horário\n3️⃣ Paciente`,
    4,
  ),

  scheduleAskPatientName: withMenuHint(
    `Perfeito. Para quem será a consulta?\n\nMe informe o *nome completo do paciente*:`,
  ),

  scheduleConflict: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return withMenuOption(`⚠️ Este horário está ocupado. Escolha um horário disponível:\n\n${lines}`, slots.length + 1)
  },

  scheduleNoSlots: `😕 Não encontrei horários disponíveis nos próximos dias.

Deseja falar com nossa equipe?

1️⃣ Sim, falar com secretária
2️⃣ Voltar ao menu`,

  // List-based scheduling flow (interactive lists)
  scheduleDayList: (days: DayOption[], hasMore: boolean) => {
    const lines = days.map((d, i) => `${i + 1}️⃣ ${d.label}`).join('\n')
    const moreOption = hasMore ? `\n${days.length + 1}️⃣ 📅 Ver mais datas` : ''
    return withMenuOption(`📅 Escolha o dia da consulta:\n\n${lines}${moreOption}`, days.length + (hasMore ? 1 : 0) + 1)
  },

  scheduleSlotList: (dayLabel: string, slots: Slot[], showBack: boolean) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    const backOption = showBack ? `\n${slots.length + 1}️⃣ ↩️ Outra data` : ''
    return withMenuOption(`🕐 Horários disponíveis para *${dayLabel}*:\n\n${lines}${backOption}`, slots.length + (showBack ? 1 : 0) + 1)
  },

  rescheduleDayList: (days: DayOption[], hasMore: boolean) => {
    const lines = days.map((d, i) => `${i + 1}️⃣ ${d.label}`).join('\n')
    const moreOption = hasMore ? `\n${days.length + 1}️⃣ 📅 Ver mais datas` : ''
    return withMenuOption(`📅 Escolha o novo dia da consulta:\n\n${lines}${moreOption}`, days.length + (hasMore ? 1 : 0) + 1)
  },

  rescheduleSlotList: (dayLabel: string, slots: Slot[], showBack: boolean) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    const backOption = showBack ? `\n${slots.length + 1}️⃣ ↩️ Outra data` : ''
    return withMenuOption(`🕐 Horários disponíveis para *${dayLabel}*:\n\n${lines}${backOption}`, slots.length + (showBack ? 1 : 0) + 1)
  },

  // -------------------------------------------------------------------------
  // Reagendamento
  // -------------------------------------------------------------------------
  rescheduleAskDay: withMenuHint(`Entendido! Vou remarcar sua consulta.

Qual o *novo dia* desejado?
(ex: 28/04 ou quinta-feira)`),

  rescheduleChooseSlot: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return withMenuOption(`Escolha o novo horário da sua consulta:\n\n${lines}\n\nSelecione uma opção abaixo.`, slots.length + 1)
  },

  rescheduleAskTime: (day: string) => withMenuHint(
    `Novo dia anotado: *${day}*

Qual o *novo horário*?
 (ex: 15h, 15:30)`),

  rescheduleConflict: (slots: Slot[]) => {
    const lines = slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
    return withMenuOption(`⚠️ Este horário também está ocupado. Escolha um horário disponível:\n\n${lines}`, slots.length + 1)
  },

  // -------------------------------------------------------------------------
  // Escolha de consulta (quando paciente tem mais de uma)
  // -------------------------------------------------------------------------
  whichAppointmentCancel: (appointments: AppointmentSummary[]) => {
    const lines = appointments.map((a, i) => `${i + 1}️⃣ ${a.label}`).join('\n')
    return withMenuOption(`Encontrei ${appointments.length} consulta(s) agendada(s). Qual deseja *cancelar*?\n\n${lines}`, appointments.length + 1)
  },

  whichAppointmentReschedule: (appointments: AppointmentSummary[]) => {
    const lines = appointments.map((a, i) => `${i + 1}️⃣ ${a.label}`).join('\n')
    return withMenuOption(`Encontrei ${appointments.length} consulta(s) agendada(s). Qual deseja *remarcar*?\n\n${lines}`, appointments.length + 1)
  },

  invalidChoice: (max: number) =>
    withMenuHint(`Por favor, escolha uma das opções disponíveis (1 a ${max}).`),

  // -------------------------------------------------------------------------
  // Cancelamento
  // -------------------------------------------------------------------------
  cancelConfirmSingle: (label: string) =>
    withMenuOption(`Você deseja *cancelar* a consulta do dia:\n📅 ${label}\n\n1️⃣ Sim, cancelar\n2️⃣ Não, manter`, 3),

  cancelConfirmGeneric: withMenuOption(`Você deseja *cancelar* sua consulta?\n\n1️⃣ Sim, cancelar\n2️⃣ Não, manter`, 3),

  cancelAskWaitlist: withMenuOption(`Consulta cancelada. ✅

Gostaria de entrar na *lista de espera* caso surja um horário mais cedo?

1️⃣ Sim, entrar na lista
2️⃣ Não, obrigado`, 3),

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
  confirmAttendanceAsk: withMenuOption(`Você tem consulta(s) agendada(s) nos próximos dias. *Confirma presença?*

1️⃣ Sim, confirmo
2️⃣ Não, preciso alterar`, 3),

  confirmAttendanceSuccess: `✅ *Presença confirmada!*

Obrigado! Te esperamos. 🏥`,

  confirmAttendanceCancel: `Entendido. O que deseja fazer?

1️⃣ Remarcar consulta
2️⃣ Cancelar consulta
3️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Atendente humano
  // -------------------------------------------------------------------------
  attendantTransfer: `Certo! Vou transferir você para uma de nossas *secretárias*. 👨‍⚕️

⏳ Aguarde um momento, alguém da nossa equipe entrará em contato em breve.`,

  attendantOutOfHours: `Nossa secretária está fora do horário agora. 😕

Posso ajudar com alguma dessas opções:

1️⃣ Agendar consulta pelo bot
2️⃣ Voltar ao menu`,

  // -------------------------------------------------------------------------
  // Erros genéricos
  // -------------------------------------------------------------------------
  technicalError: withMenuHint(`Ops! Tive um problema técnico. Pode tentar novamente em instantes?

Se o problema persistir, use a opção *5 — Falar com secretária*.`),
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
