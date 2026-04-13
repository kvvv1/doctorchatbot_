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
}

export interface GestaoDSStatusUpdateRequest {
    token: string
    agendamento: string // Token/ID do agendamento
    confirmado?: boolean
    cancelado?: boolean
    motivo_cancelamento?: string
}

export interface GestaoDSAvailabilityParams {
    token: string
    data?: string // yyyy-mm-dd
}

export class GestaoDSService {
    private apiToken: string
    private baseUrl: string

    constructor(apiToken: string, isDev: boolean = true) {
        this.apiToken = apiToken
        // Only one base URL exists; dev vs prod is differentiated by path prefix (dev- prefix)
        this.baseUrl = 'https://apidev.gestaods.com.br/api'
        this.isDev = isDev
    }

    private isDev: boolean

    private getDevPrefix(): string {
        return this.isDev ? 'dev-' : ''
    }

    /**
     * Busca Paciente por CPF
     */
    async getPatient(cpf: string): Promise<GestaoDSResponse<GestaoDSPatientResponse>> {
        try {
            const cleanCpf = cpf.replace(/\D/g, '')
            const endpoint = `${this.baseUrl}/${this.getDevPrefix()}paciente/${this.apiToken}/${cleanCpf}/`

            const response = await fetch(endpoint, {
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
    async registerPatient(patient: Omit<GestaoDSPatientRequest, 'token'>): Promise<GestaoDSResponse<any>> {
        try {
            const endpoint = `${this.baseUrl}/${this.getDevPrefix()}paciente/cadastrar/`
            const body: GestaoDSPatientRequest = {
                ...patient,
                token: this.apiToken
            }

            const response = await fetch(endpoint, {
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
            console.error('GestaoDS registerPatient error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Busca horários disponíveis para uma data
     */
    async getAvailableTimes(date?: string): Promise<GestaoDSResponse<string[]>> {
        try {
            const query = date ? `?data=${date}` : ''
            const endpoint = `${this.baseUrl}/${this.getDevPrefix()}agendamento/horarios-disponiveis/${this.apiToken}${query}`

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) return { success: false, error: response.statusText }

            const data = await response.json()
            return { success: true, data }
        } catch (error) {
            console.error('GestaoDS getAvailableTimes error:', error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * Realiza um agendamento
     */
    async bookAppointment(params: Omit<GestaoDSAppointmentRequest, 'token'>): Promise<GestaoDSResponse<any>> {
        try {
            const endpoint = `${this.baseUrl}/${this.getDevPrefix()}agendamento/agendar/`
            const body: GestaoDSAppointmentRequest = {
                ...params,
                token: this.apiToken
            }

            const response = await fetch(endpoint, {
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
    async updateAppointmentStatus(params: Omit<GestaoDSStatusUpdateRequest, 'token'>): Promise<GestaoDSResponse<any>> {
        try {
            const endpoint = `${this.baseUrl}/${this.getDevPrefix()}paciente/agendamentos/`
            const body: GestaoDSStatusUpdateRequest = {
                ...params,
                token: this.apiToken
            }

            const response = await fetch(endpoint, {
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
    async listAppointments(startDate: string, endDate: string): Promise<GestaoDSResponse<any[]>> {
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
    ): Promise<GestaoDSResponse<any>> {
        return this.updateAppointmentStatus({
            agendamento: appointmentId,
            cancelado: true,
            motivo_cancelamento: reason,
        })
    }

    async confirmAppointment(
        appointmentId: GestaoDSAppointmentIdentifier
    ): Promise<GestaoDSResponse<any>> {
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
    }): Promise<GestaoDSResponse<{ newAppointmentId?: string; raw?: any }>> {
        const cancellation = await this.cancelAppointment(
            params.currentAppointmentId,
            params.reason || 'Remarcado via Doctor Chat Bot'
        )

        if (!cancellation.success) {
            return {
                success: false,
                error: cancellation.error || 'Falha ao cancelar agendamento anterior'
            }
        }

        const booking = await this.bookAppointment({
            cpf: params.cpf,
            data_agendamento: params.newStartDate,
            data_fim_agendamento: params.newEndDate,
            primeiro_atendimento: params.primeiroAtendimento,
        })

        if (!booking.success) {
            return {
                success: false,
                error: booking.error || 'Falha ao criar novo agendamento'
            }
        }

        const newAppointmentId = GestaoDSServiceHelpers.extractAppointmentId(booking.data)

        return {
            success: true,
            data: {
                newAppointmentId: newAppointmentId || undefined,
                raw: booking.data,
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
}
