/**
 * Bot Context & State Types
 * Single source of truth for all bot-related types.
 */

export type BotState =
  | 'menu'
  | 'agendar_nome'
  | 'agendar_cpf'             // collecting patient CPF for GestaoDS
  | 'consultar_cpf'           // collecting patient CPF to find appointments in GestaoDS
  | 'agendar_dia'             // legacy free-text day input (kept as fallback)
  | 'agendar_hora'            // legacy free-text time input (kept as fallback)
  | 'agendar_slot_escolha'   // patient picks from offered slots after conflict
  | 'agendar_dia_lista'       // patient picks a day from an interactive list
  | 'agendar_hora_lista'      // patient picks a time slot from an interactive list
  | 'agendar_confirmar'       // patient confirms selected day/time before booking
  | 'agendar_alterar_campo'   // patient chooses which booking field to change
  | 'agendar_alterar_paciente'// patient changes the patient name before booking
  | 'reagendar_qual'          // patient has multiple appointments — pick which one
  | 'reagendar_dia'
  | 'reagendar_hora'
  | 'reagendar_slot_escolha'  // patient picks from offered slots after reschedule conflict
  | 'reagendar_dia_lista'     // patient picks a day from an interactive list (reschedule)
  | 'reagendar_hora_lista'    // patient picks a time slot from an interactive list (reschedule)
  | 'cancelar_qual'           // patient has multiple appointments — pick which one
  | 'cancelar_confirmar'
  | 'cancelar_encaixe'
  | 'atendente'
  | 'ver_agendamentos'
  | 'confirmar_presenca'
  | 'sem_horario'

/**
 * A concrete time slot with ISO date and human-readable label.
 */
export type Slot = {
  startsAt: string  // ISO 8601
  endsAt: string    // ISO 8601
  label: string     // e.g. "10h00" (when shown inside a day list) or "Seg, 14/04 às 10h00"
}

/**
 * A day option shown in the interactive day-selection list.
 */
export type DayOption = {
  date: string   // "YYYY-MM-DD"
  label: string  // "Segunda-feira, 28/04"
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
  patientCpf?: string           // CPF for GestaoDS scheduling

  // Scheduling flow — raw text from patient before parsing (legacy)
  requestedDay?: string
  requestedTime?: string

  // Available slots offered to the patient (conflict resolution)
  availableSlots?: Slot[]
  pendingScheduleSlot?: Slot

  // List-based scheduling flow
  availableDays?: DayOption[]     // days shown in the interactive day list
  selectedDay?: string            // "YYYY-MM-DD" of the day the patient picked
  selectedDayLabel?: string       // human label of the selected day, e.g. "Segunda-feira, 28/04"
  dayListOffset?: number          // pagination offset for "Ver mais datas"
  dayListHasMore?: boolean        // whether the current day list page has a "Ver mais datas" option

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
