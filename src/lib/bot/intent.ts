/**
 * Simple intent detection without AI
 */

export type Intent = 'schedule' | 'reschedule' | 'cancel' | 'other';

/**
 * Detect user intent from message text
 */
export function detectIntent(text: string): Intent {
  const normalized = text.toLowerCase().trim();

  // Schedule intent
  if (
    normalized.includes('agendar') ||
    normalized.includes('marcar') ||
    normalized.includes('consulta') ||
    normalized.match(/\b(1|um|uma)\b/)
  ) {
    return 'schedule';
  }

  // Reschedule intent
  if (
    normalized.includes('remarcar') ||
    normalized.includes('reagendar') ||
    normalized.includes('trocar') ||
    normalized.match(/\b(2|dois|duas)\b/)
  ) {
    return 'reschedule';
  }

  // Cancel intent
  if (
    normalized.includes('cancelar') ||
    normalized.includes('desmarcar') ||
    normalized.match(/\b(3|tres|três)\b/)
  ) {
    return 'cancel';
  }

  return 'other';
}

/**
 * Detect yes/no response
 */
export function detectYesNo(text: string): 'yes' | 'no' | 'unknown' {
  const normalized = text.toLowerCase().trim();

  if (
    normalized.includes('sim') ||
    normalized.includes('confirmo') ||
    normalized.includes('ok') ||
    normalized.includes('certeza')
  ) {
    return 'yes';
  }

  if (
    normalized.includes('não') ||
    normalized.includes('nao') ||
    normalized.includes('negativo')
  ) {
    return 'no';
  }

  return 'unknown';
}
