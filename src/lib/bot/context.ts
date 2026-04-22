/**
 * Bot Context & State Types
 * Single source of truth for all bot-related types.
 */

export type BotState =
  | 'menu'
  | 'agendar_para_quem'        // patient picks: for me / for someone else / for more than one
  | 'agendar_quantos'          // patient picks how many people (2, 3 or 4) after "para mais de uma"
  | 'agendar_convenio'       // patient selects which insurance plan they have
  | 'convenio_sem_cadastro'   // no insurance plans configured — offer secretária or menu
  | 'convenio_aguardando_carteirinha' // waiting for patient to send photo of insurance card
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
  | 'agendar_sem_slots_convenio' // no slots in convênio, offer particular or secretary
  | 'reagendar_qual'          // patient has multiple appointments — pick which one
  | 'reagendar_manter_tipo'   // patient confirms or changes appointment type before reschedule
  | 'reagendar_convenio'      // patient selects which insurance plan for reschedule
  | 'reagendar_tipo'          // patient picks Particular or Convênio before reschedule (legacy)
  | 'reagendar_dia'
  | 'reagendar_hora'
  | 'reagendar_slot_escolha'  // patient picks from offered slots after reschedule conflict
  | 'reagendar_dia_lista'     // patient picks a day from an interactive list (reschedule)
  | 'reagendar_hora_lista'    // patient picks a time slot from an interactive list (reschedule)
  | 'reagendar_sem_slots_convenio' // no slots in convênio, offer particular or secretary
  | 'cancelar_qual'           // patient has multiple appointments — pick which one
  | 'cancelar_tipo'           // patient picks Particular or Convênio before cancel
  | 'cancelar_confirmar'
  | 'cancelar_encaixe'
  | 'atendente'
  | 'ver_agendamentos'
  | 'ver_agendamento_selecionado'  // patient selected one appointment from list, choosing action
  | 'confirmar_presenca'
  | 'lista_espera_faixa'  // patient picks preferred time window for waitlist
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
  appointmentType?: 'particular' | 'convenio' | null
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

  // Appointment type (particular or convenio)
  appointmentType?: 'particular' | 'convenio'
  // Selected insurance plan name
  selectedConvenio?: string

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

  // Index of the appointment the patient selected from the list (0-based)
  selectedAppointmentIndex?: number

  // Waitlist
  waitlistId?: string
  waitlistPreferredTimeStart?: string  // "08" (hour)
  waitlistPreferredTimeEnd?: string    // "12" (hour)
  waitlistAppointmentType?: 'particular' | 'convenio'

  // General
  intent?: string
  retryCount?: number
  /** ISO datetime of the appointment slot that was just canceled (set by handleCancelarConfirmar) */
  canceledStartsAt?: string

  // Multi-booking flow (scheduling for multiple people)
  multiBookingTotal?: number    // total number of people to book for
  multiBookingCurrent?: number  // current person index (1-based)
}
