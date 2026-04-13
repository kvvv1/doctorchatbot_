/**
 * Bot Context & State Types
 * Single source of truth for all bot-related types.
 */

export type BotState =
  | 'menu'
  | 'agendar_nome'
  | 'agendar_dia'
  | 'agendar_hora'
  | 'agendar_slot_escolha'   // patient picks from offered slots after conflict
  | 'reagendar_qual'          // patient has multiple appointments — pick which one
  | 'reagendar_dia'
  | 'reagendar_hora'
  | 'reagendar_slot_escolha'  // patient picks from offered slots after reschedule conflict
  | 'cancelar_qual'           // patient has multiple appointments — pick which one
  | 'cancelar_confirmar'
  | 'cancelar_encaixe'
  | 'atendente'
  | 'ver_agendamentos'
  | 'confirmar_presenca'

/**
 * A concrete time slot with ISO date and human-readable label.
 */
export type Slot = {
  startsAt: string  // ISO 8601
  endsAt: string    // ISO 8601
  label: string     // e.g. "Segunda, 14/04 às 10h00"
}

/**
 * A simplified appointment shown to the patient during a flow.
 */
export type AppointmentSummary = {
  id: string
  startsAt: string  // ISO 8601
  label: string     // e.g. "Segunda, 14/04 às 10h00"
  status: string
}

/**
 * Rich conversation context stored in the database alongside bot_state.
 * Every field is optional — only relevant fields are populated per state.
 */
export type BotContext = {
  // Patient identity
  patientPhone?: string
  patientName?: string

  // Scheduling flow — raw text from patient before parsing
  requestedDay?: string
  requestedTime?: string

  // Available slots offered to the patient (conflict resolution)
  availableSlots?: Slot[]

  // Target appointment for cancel / reschedule flows
  appointmentId?: string

  // List of appointments shown to the patient (when > 1 exists)
  appointments?: AppointmentSummary[]

  // Waitlist
  waitlistId?: string

  // General
  intent?: string
  retryCount?: number
}
