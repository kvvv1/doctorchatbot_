/**
 * Simple intent detection without AI
 */

export type Intent =
  | 'schedule'
  | 'schedule_exam'
  | 'reschedule'
  | 'cancel'
  | 'attendant'
  | 'view_appointments'
  | 'confirm_attendance'
  | 'waitlist'
  | 'other';

/**
 * Detect user intent from message text
 */
export function detectIntent(text: string): Intent {
  const normalized = text.toLowerCase().trim();

  // Schedule exam intent (6) — only when NOT combined with reschedule/cancel keywords
  if (normalized.match(/\b(6|seis)\b/)) {
    return 'schedule_exam';
  }

  // Schedule intent (1)
  // Note: check for remarcar/reagendar first to avoid matching 'marcar' inside 'remarcar'
  if (
    normalized.includes('remarcar') ||
    normalized.includes('reagendar') ||
    normalized.includes('trocar') ||
    normalized.match(/\b(3|tres|três)\b/)
  ) {
    return 'reschedule';
  }

  if (
    normalized.includes('cancelar') ||
    normalized.includes('desmarcar') ||
    normalized.match(/\b(4|quatro)\b/)
  ) {
    return 'cancel';
  }

  if (
    normalized.includes('agendar') ||
    normalized.includes('marcar') ||
    normalized.match(/\b(1|um|uma)\b/)
  ) {
    return 'schedule';
  }

  // Exam scheduling — after reschedule/cancel/schedule checks so "remarcar exame" maps to reschedule
  if (
    normalized.includes('exame') ||
    normalized.includes('exames')
  ) {
    return 'schedule_exam';
  }

  // View appointments intent (2)
  if (
    normalized.includes('ver consulta') ||
    normalized.includes('minha consulta') ||
    normalized.includes('meu agendamento') ||
    normalized.includes('meus agendamento') ||
    normalized.includes('ver agendamento') ||
    normalized.includes('minhas consultas') ||
    normalized.match(/\b(2|dois|duas)\b/)
  ) {
    return 'view_appointments';
  }

  // Attendant intent (5)
  if (
    normalized.includes('atendente') ||
    normalized.includes('secretaria') ||
    normalized.includes('secretária') ||
    normalized.includes('humano') ||
    normalized.includes('pessoa') ||
    normalized.includes('falar com') ||
    normalized.match(/\b(5|cinco)\b/)
  ) {
    return 'attendant';
  }

  // Confirm attendance intent
  if (
    normalized.includes('confirmar presença') ||
    normalized.includes('confirmar presenca') ||
    normalized.includes('vou comparecer') ||
    normalized.includes('estarei lá')
  ) {
    return 'confirm_attendance';
  }

  // Waitlist intent (7 — after schedule_exam which is 6)
  if (
    normalized.includes('lista de espera') ||
    normalized.includes('lista espera') ||
    normalized.includes('entrar na lista') ||
    normalized.match(/\b(7|sete)\b/)
  ) {
    return 'waitlist';
  }

  return 'other';
}

/**
 * Detect yes/no response
 */
export function detectYesNo(text: string): 'yes' | 'no' | 'unknown' {
  const normalized = text.toLowerCase().trim();

  if (
    normalized === 'sim' ||
    normalized.startsWith('sim,') ||
    normalized.startsWith('sim ') ||
    normalized === 's' ||
    normalized.includes('confirmo') ||
    normalized.includes('confirmar') ||
    normalized.includes('com certeza') ||
    normalized.includes('claro') ||
    normalized === 'ok' ||
    normalized === '1' ||
    normalized.includes('pode') ||
    normalized.includes('quero') ||
    normalized.includes('certeza')
  ) {
    return 'yes';
  }

  if (
    normalized === 'não' ||
    normalized === 'nao' ||
    normalized === 'n' ||
    normalized === '2' ||
    normalized.startsWith('não,') ||
    normalized.startsWith('nao,') ||
    normalized.startsWith('não ') ||
    normalized.startsWith('nao ') ||
    normalized.includes('negativo') ||
    normalized.includes('não quero') ||
    normalized.includes('nao quero')
  ) {
    return 'no';
  }

  return 'unknown';
}
