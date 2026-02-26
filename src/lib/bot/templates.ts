/**
 * Bot response templates in Brazilian Portuguese
 */

export const templates = {
  // Menu and greeting
  menu: `Olá! Como posso ajudar você hoje?

1️⃣ Agendar uma consulta
2️⃣ Remarcar consulta
3️⃣ Cancelar consulta

Digite o número ou descreva o que precisa.`,

  notUnderstood: `Desculpe, não entendi. Por favor, escolha uma das opções:

1️⃣ Agendar consulta
2️⃣ Remarcar consulta
3️⃣ Cancelar consulta`,

  // Scheduling flow
  scheduleAskName: `Ótimo! Vou agendar sua consulta. 😊

Por favor, me informe seu nome completo:`,

  scheduleAskDay: (name: string) => 
    `Obrigado, ${name}! 👍

Qual dia você prefere para a consulta? (exemplo: 20/02 ou segunda-feira)`,

  scheduleAskTime: (day: string) => 
    `Perfeito! Dia ${day}.

Qual horário você prefere? (exemplo: 14h ou 14:00)`,

  scheduleConfirm: (name: string, day: string, time: string) => 
    `✅ Consulta agendada com sucesso!

📋 Nome: ${name}
📅 Dia: ${day}
🕐 Hora: ${time}

Nossa equipe entrará em contato para confirmar. Se precisar de algo mais, é só avisar!`,

  // Rescheduling flow
  rescheduleAskDay: `Entendi que você quer remarcar.

Qual o novo dia desejado? (exemplo: 25/02 ou quinta-feira)`,

  rescheduleAskTime: (day: string) => 
    `Novo dia: ${day}

Qual o novo horário? (exemplo: 15h ou 15:00)`,

  rescheduleConfirm: (day: string, time: string) => 
    `✅ Consulta remarcada!

📅 Novo dia: ${day}
🕐 Novo horário: ${time}

Em breve nossa equipe confirmará a alteração. Obrigado!`,

  // Cancellation flow
  cancelConfirm: `Você deseja cancelar sua consulta?

Digite *SIM* para confirmar ou *NÃO* para voltar ao menu.`,

  cancelAskWaitlist: `Entendido. Quer entrar na lista de espera caso surja um horário mais cedo?

Digite *SIM* ou *NÃO*`,

  cancelWithWaitlist: `✅ Consulta cancelada.

Você foi adicionado à lista de espera. Avisaremos se surgir um horário disponível. Obrigado!`,

  cancelWithoutWaitlist: `✅ Consulta cancelada.

Se precisar agendar novamente, é só chamar! Obrigado.`,

  cancelAborted: `Ok, nada foi cancelado. Sua consulta está mantida. 👍

Precisa de mais alguma coisa?`,
};
