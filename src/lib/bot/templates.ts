/**
 * Bot response templates in Brazilian Portuguese
 */

export const templates = {
  // Menu principal
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

  // Fluxo de agendamento
  scheduleAskName: `Ótimo! Vou agendar sua consulta. 😊

Por favor, me informe seu *nome completo*:`,

  scheduleAskDay: (name: string) =>
    `Obrigado, *${name}*! 👍

Qual dia você prefere para a consulta?
Pode digitar a data (ex: 25/03) ou o dia da semana (ex: segunda-feira).`,

  scheduleAskTime: (day: string) =>
    `Perfeito! Anotei o dia *${day}*.

Qual horário você prefere?
Pode digitar (ex: 14h ou 14:30)`,

  scheduleConfirm: (name: string, day: string, time: string) =>
    `✅ *Consulta agendada com sucesso!*

📋 Paciente: ${name}
📅 Data: ${day}
🕐 Horário: ${time}

Nossa equipe irá confirmar em breve. Se precisar de algo, é só chamar! 🏥`,

  // Fluxo de remarcação
  rescheduleAskDay: `Entendido! Vou remarcar sua consulta.

Qual o *novo dia* desejado?
(ex: 28/03 ou quinta-feira)`,

  rescheduleAskTime: (day: string) =>
    `Novo dia anotado: *${day}*

Qual o *novo horário*?
(ex: 15h ou 15:30)`,

  rescheduleConfirm: (day: string, time: string) =>
    `✅ *Consulta remarcada com sucesso!*

📅 Novo dia: ${day}
🕐 Novo horário: ${time}

Em breve nossa equipe confirmará a alteração. Obrigado! 😊`,

  // Fluxo de cancelamento
  cancelConfirm: `Você deseja *cancelar* sua consulta?

Digite *SIM* para confirmar ou *NÃO* para voltar ao menu.`,

  cancelAskWaitlist: `Consulta cancelada. ✅

Gostaria de entrar na *lista de espera* caso surja um horário mais cedo?

Digite *SIM* ou *NÃO*`,

  cancelWithWaitlist: `✅ Consulta cancelada com sucesso.

Você foi adicionado à *lista de espera*. Avisaremos assim que surgir um horário disponível! 📲`,

  cancelWithoutWaitlist: `✅ Consulta cancelada.

Se precisar agendar novamente no futuro, é só chamar! Obrigado. 😊`,

  cancelAborted: `Ok! Sua consulta está *mantida*. 👍

Posso ajudar em algo mais?`,

  // Atendente humano
  attendantTransfer: `Certo! Vou transferir você para um de nossos *atendentes*. 👨‍⚕️

⏳ Aguarde um momento, alguém da nossa equipe entrará em contato em breve.

Horário de atendimento: *Segunda a Sexta, 8h às 18h*`,

  attendantOutOfHours: `Poxa, nossos atendentes estão *fora do horário* agora. 😕

Horário de atendimento: *Segunda a Sexta, 8h às 18h*

Você pode:
1️⃣ Deixar uma mensagem — responderemos em breve
2️⃣ Agendar pelo bot agora mesmo`,

  // Ver agendamentos
  viewAppointmentsNotFound: `Não encontrei consultas agendadas para o seu número. 🔍

Gostaria de agendar uma nova consulta?

1️⃣ Sim, agendar agora
2️⃣ Não, obrigado`,

  viewAppointments: (appointments: Array<{ date: string; time: string; status: string }>) => {
    const lines = appointments
      .slice(0, 5)
      .map(
        (a, i) =>
          `${i + 1}. 📅 ${a.date} às ${a.time} — ${statusLabel(a.status)}`
      )
      .join('\n');

    return `Seus próximos agendamentos: 📋

${lines}

Precisa remarcar ou cancelar? Digite o número da opção desejada ou escolha:
1️⃣ Remarcar   2️⃣ Cancelar   3️⃣ Menu principal`;
  },

  // Confirmar presença
  confirmAttendanceAsk: `Ótimo! Para confirmar sua presença, você tem alguma consulta agendada nos próximos dias.

*Confirma que comparecerá?*
Digite *SIM* para confirmar ou *NÃO* se precisar cancelar/remarcar.`,

  confirmAttendanceSuccess: `✅ *Presença confirmada!*

Obrigado por confirmar. Te esperamos! 🏥

Se precisar remarcar, é só avisar.`,

  confirmAttendanceCancel: `Entendido. Vamos ajudar você a remarcar ou cancelar.

1️⃣ Remarcar consulta
2️⃣ Cancelar consulta
3️⃣ Voltar ao menu`,
};

/**
 * Traduz status do agendamento para português amigável
 */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '⏳ Aguardando confirmação',
    confirmed: '✅ Confirmada',
    scheduled: '✅ Confirmada',
    canceled: '❌ Cancelada',
    waitlist: '📋 Lista de espera',
    done: '✔️ Realizada',
  };
  return map[status] || status;
}
