/**
 * Variable interpolation for bot message templates.
 * Supports {{nome}}, {{data}}, {{horario}} placeholders in configurable messages.
 */

export interface MessageVars {
  nome?: string
  data?: string
  horario?: string
}

/** Fake values used in the WhatsApp preview panel */
export const PREVIEW_VARS: MessageVars = {
  nome: 'Maria Silva',
  data: 'Ter, 22/04',
  horario: '14h30',
}

/** Variable definitions shown as chips in the UI */
export const TEMPLATE_VARIABLES: Array<{
  key: keyof MessageVars
  label: string
  description: string
}> = [
  { key: 'nome',    label: '{{nome}}',    description: 'Nome do paciente' },
  { key: 'data',    label: '{{data}}',    description: 'Data da consulta' },
  { key: 'horario', label: '{{horario}}', description: 'Horário da consulta' },
]

/**
 * Replace {{variavel}} placeholders with real values.
 * Unknown keys are left as-is (e.g. {{variavel_desconhecida}}).
 */
export function interpolate(template: string, vars: MessageVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = (vars as Record<string, string | undefined>)[key]
    return val !== undefined ? val : match
  })
}
