/**
 * GestãoDS API Service
 * Handles comprehensive communication with GestãoDS for patients, availability, and appointments.
 * Documentation: https://apidev.gestaods.com.br/redoc
 */

export interface GestaoDSPatientRequest {
    nome_completo: string
    cpf: string
    email: string
    celular?: string
    telefone?: string
    nascimento?: string // xx/xx/xxxx
    sexo?: 'M' | 'F'
    enviar_sms?: boolean
    enviar_whatsapp_lembrete?: boolean
    token: string
}

export interface GestaoDSPatientResponse {
    id: number
    nome: string
    cpf: string
    celular?: string
    email?: string
}

export interface GestaoDSAppointmentRequest {
    data_agendamento: string // dd/mm/yyyy hh:mm:ss
    data_fim_agendamento: string // dd/mm/yyyy hh:mm:ss
    cpf: string
    token: string
    primeiro_atendimento?: boolean
    tipo_consulta?: 'particular' | 'convenio' // Appointment type
}

export interface GestaoDSPatientAppointmentsRequest {
    cpf: string
    token: string
}

export interface GestaoDSStatusUpdateRequest {
    token: string
    agendamento: string // Token/ID do agendamento
    confirmado?: boolean
    cancelado?: boolean
    motivo_cancelamento?: string
}

export interface GestaoDSRescheduleRequest {
    data_agendamento: string // dd/mm/yyyy hh:mm:ss
    data_fim_agendamento: string // dd/mm/yyyy hh:mm:ss
    token: string
    agendamento: string
}

export interface GestaoDSAvailabilityParams {
    token: string
    data?: string // yyyy-mm-dd
}

export class GestaoDSService {
    private apiToken: string
    private baseUrl: string
    private agendaTimezoneOffsetHours?: number

    constructor(apiToken: string, isDev: boolean = false) {
        this.apiToken = apiToken
        // Only one base URL exists; dev vs prod is differentiated by path prefix (dev- prefix)
        this.baseUrl = 'https://apidev.gestaods.com.br/api'
        this.isDev = isDev
    }

    private isDev: boolean

    private getDevPrefix(): string {
        return this.isDev ? 'dev-' : ''
    }

    private buildEndpoint(path: string, useDevPrefix: boolean = this.isDev): string {
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path
        const prefix = useDevPrefix ? 'dev-' : ''
        return `${this.baseUrl}/${prefix}${normalizedPath}`
    }

    private async fetchWithEnvironmentFallback(path: string, init: RequestInit): Promise<Response> {
        const primaryResponse = await fetch(this.buildEndpoint(path), init)
        if (primaryResponse.ok || !this.isDev) {
            return primaryResponse
        }

        // Some clinics have a production token saved with gestaods_is_dev=true.
        // Retry the production path transparently so availability/booking still work.
        return await fetch(this.buildEndpoint(path, false), init)
    }

    private static parseTimezoneOffsetHours(raw: unknown): number | null {
        if (typeof raw !== 'string') {
            return null
        }

        const text = raw.trim().toLowerCase()
        if (!text) {
            return null
        }

        if (text.includes('sao_paulo') || text.includes('sao paulo')) {
            // The system stores dates as BRT values in UTC fields (server runs in UTC but
            // treats user-typed hours as BRT directly).  No additional shift is needed
            // to produce the correct BRT string for the GestãoDS API.
            return 0
        }

        const normalized = text.replace('utc', '').replace('gmt', '').trim()
        const match = normalized.match(/([+-]\d{1,2})(?::?(\d{2}))?/) || normalized.match(/^([+-]?\d{1,2})$/)

        if (!match || !match[1]) {
            return null
        }

        const hours = Number(match[1])
        const minutes = match[2] ? Number(match[2]) : 0

        if (Number.isNaN(hours) || Number.isNaN(minutes)) {
            return null
        }

        const sign = hours >= 0 ? 1 : -1
        return hours + sign * (minutes / 60)
    }

    private static formatDateWithOffset(date: Date, offsetHours: number): string {
        const shifted = new Date(date.getTime() + offsetHours * 60 * 60 * 1000)
        const pad = (value: number) => String(value).padStart(2, '0')
        return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
    }

    private async getAgendaTimezoneOffsetHours(): Promise<number> {
        if (typeof this.agendaTimezoneOffsetHours === 'number') {
            return this.agendaTimezoneOffsetHours
        }

        // The Vercel server runs in UTC, but throughout this codebase BRT times are
        // stored/created as if they were UTC (naive convention: setHours(date, 15) on
        // a UTC server gives "15:00 UTC", which in the UI is read as "15:00 BRT").
        // Therefore formatDateForApi must NOT apply any timezone shift — the Date value
        // already holds the intended BRT digits.  Ignoring the GestãoDS timezone API
        // avoids a -3h subtraction that would turn "15:00" into "12:00".
        this.agendaTimezoneOffsetHours = 0
        return 0
    }

    async formatDateForApi(date: Date): Promise<string> {
        const offset = await this.getAgendaTimezoneOffsetHours()
        return GestaoDSService.formatDateWithOffset(date, offset)
    }

    /**
     * Busca Paciente por CPF
     */
    async getPatient(cpf: string): Promise<GestaoDSResponse<GestaoDSPatientResponse>> {
        try {
            const cleanCpf = cpf.replace(/\D/g, '')
            const response = await this.fetchWithEnvironmentFallback(`paciente/${this.apiToken}/${cleanCpf}/`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) {
                return { success: false, error: `Error fetching patient: ${response.statusText}` }
            }

            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS getPatient error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Cadastra um novo paciente
     */
    async registerPatient(patient: Omit<GestaoDSPatientRequest, 'token'>): Promise<GestaoDSResponse<unknown>> {
        try {
            const body: GestaoDSPatientRequest = {
                ...patient,
                token: this.apiToken
            }

            const response = await this.fetchWithEnvironmentFallback('paciente/cadastrar/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                console.error('[GestaoDS] registerPatient failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData,
                })
                return { success: false, error: errorData.detail || errorData.message || response.statusText }
            }

            const data = await response.json()
            console.log('[GestaoDS] registerPatient success:', {
                responseShape: data ? Object.keys(data) : null,
                data: data,
            })
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS registerPatient error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Busca horários disponíveis para uma data
     * A API retorna { tempo_intervalo, data: ["HH:MM:SS", ...], status }
     */
    async getAvailableTimes(date?: string): Promise<GestaoDSResponse<string[]>> {
        try {
            const query = date ? `?data=${encodeURIComponent(date)}` : ''
            const response = await this.fetchWithEnvironmentFallback(`agendamento/horarios-disponiveis/${this.apiToken}${query}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) return { success: false, error: `${response.status} ${response.statusText}` }

            const json = await response.json()
            // Response format: { tempo_intervalo: 20, data: ["09:00:00", ...], status: 200 }
            const data: string[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS getAvailableTimes error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Busca dias disponíveis (próximos ~30 dias)
     * A API retorna { data: [{data: "dd/MM/yyyy", disponivel: bool}, ...], status }
     */
    async getDiasDisponiveis(fromDate?: string): Promise<GestaoDSResponse<Array<{ data: string; disponivel: boolean }>>> {
        try {
            const query = fromDate ? `?data=${encodeURIComponent(fromDate)}` : ''
            const response = await this.fetchWithEnvironmentFallback(`agendamento/dias-disponiveis/${this.apiToken}${query}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) return { success: false, error: `${response.status} ${response.statusText}` }

            const json = await response.json()
            const data = Array.isArray(json?.data) ? json.data : []
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS getDiasDisponiveis error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Retorna os dados da agenda para o token configurado.
     */
    async getAgendaData(): Promise<GestaoDSResponse<Record<string, unknown>>> {
        try {
            const response = await this.fetchWithEnvironmentFallback(`dados-agendamento/${this.apiToken}/`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) {
                return { success: false, error: `${response.status} ${response.statusText}` }
            }

            const data = await response.json()
            return {
                success: true,
                data: data && typeof data === 'object' ? data : { raw: data }
            }
        } catch (error) {
            console.error('GestaoDS getAgendaData error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Retorna os detalhes de um agendamento específico.
     */
    async getAppointmentById(appointmentId: string): Promise<GestaoDSResponse<Record<string, unknown>>> {
        try {
            const query = `token=${encodeURIComponent(this.apiToken)}&agendamento=${encodeURIComponent(appointmentId)}`
            const response = await this.fetchWithEnvironmentFallback(`agendamento/retornar-agendamento/?${query}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) {
                return { success: false, error: `${response.status} ${response.statusText}` }
            }

            const data = await response.json()
            return {
                success: true,
                data: data && typeof data === 'object' ? data : { raw: data }
            }
        } catch (error) {
            console.error('GestaoDS getAppointmentById error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Retorna o fuso configurado da agenda.
     */
    async getAgendaTimezone(): Promise<GestaoDSResponse<string>> {
        try {
            const response = await this.fetchWithEnvironmentFallback(`agendamento/retornar-fuso-horario/${this.apiToken}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) {
                return { success: false, error: `${response.status} ${response.statusText}` }
            }

            const data = await response.json()

            if (typeof data === 'string') {
                return { success: true, data }
            }

            if (data && typeof data === 'object') {
                const node = data as Record<string, unknown>
                const timezone = node.fuso_horario || node.timezone || node.data
                if (typeof timezone === 'string') {
                    return { success: true, data: timezone }
                }
            }

            return { success: false, error: 'GestãoDS não retornou o fuso horário em formato esperado.' }
        } catch (error) {
            console.error('GestaoDS getAgendaTimezone error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Busca os agendamentos de um paciente via CPF.
     */
    async listPatientAppointments(cpf: string): Promise<GestaoDSResponse<Record<string, unknown>[]>> {
        try {
            const cleanCpf = cpf.replace(/\D/g, '')
            const body: GestaoDSPatientAppointmentsRequest = {
                cpf: cleanCpf,
                token: this.apiToken,
            }

            const response = await this.fetchWithEnvironmentFallback('paciente/agendamentos/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                return { success: false, error: errorData.detail || response.statusText }
            }

            const data = await response.json()
            const records = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
            return { success: true, data: records }
        } catch (error) {
            console.error('GestaoDS listPatientAppointments error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Realiza um agendamento
     */
    async bookAppointment(params: Omit<GestaoDSAppointmentRequest, 'token'>): Promise<GestaoDSResponse<unknown>> {
        try {
            const body: GestaoDSAppointmentRequest = {
                ...params,
                token: this.apiToken
            }
            console.log('[GestaoDS] bookAppointment request:', {
                endpoint: 'agendamento/agendar/',
                cpf: body.cpf ? body.cpf.substring(0, 5) + '***' : undefined,
                data_agendamento: body.data_agendamento,
                data_fim_agendamento: body.data_fim_agendamento,
                primeiro_atendimento: body.primeiro_atendimento,
            })

            const response = await this.fetchWithEnvironmentFallback('agendamento/agendar/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                return { success: false, error: errorData.detail || response.statusText }
            }

            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS bookAppointment error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Altera status de um agendamento (Confirmar/Cancelar)
     */
    async updateAppointmentStatus(params: Omit<GestaoDSStatusUpdateRequest, 'token'>): Promise<GestaoDSResponse<unknown>> {
        try {
            const body: GestaoDSStatusUpdateRequest = {
                ...params,
                token: this.apiToken
            }

            const response = await this.fetchWithEnvironmentFallback('paciente/agendamentos/', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) return { success: false, error: response.statusText }

            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS updateAppointmentStatus error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Relatório de agendamentos para sincronização (GET)
     * Nota: o endpoint de listagem só existe na rota /dados-agendamento/listagem/ (sem prefixo dev-).
     * O isDev diferencia apenas outras operações (criar/cancelar agendamentos de teste).
     */
    async listAppointments(startDate: string, endDate: string): Promise<GestaoDSResponse<Record<string, unknown>[]>> {
        try {
            // Converte datas de yyyy-MM-dd para dd/mm/yyyy (formato da API brasileira)
            const toApiDate = (d: string) => {
                const [y, m, day] = d.split('-')
                return `${day}/${m}/${y}`
            }
            const endpoint = `${this.baseUrl}/dados-agendamento/listagem/${this.apiToken}?data_inicial=${toApiDate(startDate)}&data_final=${toApiDate(endDate)}`

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }

            const data = await response.json()
            // Resposta real: { data: [...], status: 200 }
            const records = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
            return { success: true, data: records }
        } catch (error) {
            console.error('GestaoDS listAppointments error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Verifica conectividade básica com GestãoDS.
     * Usa listagem de horários disponíveis como ping funcional.
     */
    async healthCheck(): Promise<GestaoDSResponse<{ ok: boolean }>> {
        const ping = await this.getAvailableTimes()

        if (!ping.success) {
            return {
                success: false,
                error: ping.error || 'Falha ao validar conexão com GestãoDS'
            }
        }

        return { success: true, data: { ok: true } }
    }

    async cancelAppointment(
        appointmentId: GestaoDSAppointmentIdentifier,
        reason: string = 'Cancelado via Doctor Chat Bot'
    ): Promise<GestaoDSResponse<unknown>> {
        return this.updateAppointmentStatus({
            agendamento: appointmentId,
            cancelado: true,
            motivo_cancelamento: reason,
        })
    }

    async confirmAppointment(
        appointmentId: GestaoDSAppointmentIdentifier
    ): Promise<GestaoDSResponse<unknown>> {
        return this.updateAppointmentStatus({
            agendamento: appointmentId,
            confirmado: true,
        })
    }

    async rescheduleAppointment(params: {
        currentAppointmentId: GestaoDSAppointmentIdentifier
        cpf: string
        newStartDate: string
        newEndDate: string
        reason?: string
        primeiroAtendimento?: boolean
    }): Promise<GestaoDSResponse<{ newAppointmentId?: string; raw?: unknown }>> {
        try {
            const body: GestaoDSRescheduleRequest = {
                agendamento: params.currentAppointmentId,
                data_agendamento: params.newStartDate,
                data_fim_agendamento: params.newEndDate,
                token: this.apiToken,
            }

            const response = await this.fetchWithEnvironmentFallback('agendamento/reagendar/', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                return {
                    success: false,
                    error: errorData.detail || errorData.message || `Erro ao reagendar no GestãoDS (${response.status})`
                }
            }

            const data = await response.json()
            const newAppointmentId =
                GestaoDSServiceHelpers.extractAppointmentId(data) ||
                params.currentAppointmentId

            return {
                success: true,
                data: {
                    newAppointmentId: newAppointmentId || undefined,
                    raw: data,
                }
            }
        } catch (error) {
            console.error('GestaoDS rescheduleAppointment error:', error)
            return {
                success: false,
                error: String(error)
            }
        }
    }
}

export interface GestaoDSResponse<T> {
    success: boolean
    data?: T
    error?: string
}

export type GestaoDSAppointmentIdentifier = string

export class GestaoDSServiceHelpers {
    static extractAppointmentId(payload: unknown): GestaoDSAppointmentIdentifier | null {
        if (!payload || typeof payload !== 'object') {
            return null
        }

        const source = payload as Record<string, unknown>
        const nested = source.data && typeof source.data === 'object'
            ? (source.data as Record<string, unknown>)
            : null

        const candidate =
            source.agendamento ||
            source.token ||
            source.id ||
            source.appointment_id ||
            source.codigo ||
            nested?.agendamento ||
            nested?.token ||
            nested?.id

        if (candidate === undefined || candidate === null) {
            return null
        }

        const output = String(candidate).trim()
        return output.length > 0 ? output : null
    }

    static extractPatientCpf(payload: unknown): string | null {
        if (!payload || typeof payload !== 'object') {
            return null
        }

        const source = payload as Record<string, unknown>
        const nested = source.data && typeof source.data === 'object'
            ? (source.data as Record<string, unknown>)
            : null
        const patient =
            source.paciente && typeof source.paciente === 'object'
                ? (source.paciente as Record<string, unknown>)
                : nested?.paciente && typeof nested.paciente === 'object'
                    ? (nested.paciente as Record<string, unknown>)
                    : null

        const candidates = [
            source.cpf,
            source.paciente_cpf,
            nested?.cpf,
            nested?.paciente_cpf,
            patient?.cpf,
        ]

        for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) {
                continue
            }

            const digits = String(candidate).replace(/\D/g, '')
            if (digits.length === 11) {
                return digits
            }
        }

        return null
    }
}
