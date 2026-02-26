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
        // The user provided the apidev URL, so we default to the dev path if isDev is true
        this.baseUrl = isDev ? 'https://apidev.gestaods.com.br/api' : 'https://api.gestaods.com.br/api'
    }

    private getDevPrefix(): string {
        return this.baseUrl.includes('apidev') ? 'dev-' : ''
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
     */
    async listAppointments(startDate: string, endDate: string): Promise<GestaoDSResponse<any[]>> {
        try {
            // Formato: yyyy-mm-dd
            const endpoint = `${this.baseUrl}/${this.getDevPrefix()}dados-agendamento/listagem/${this.apiToken}?data_inicial=${startDate}&data_final=${endDate}`

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) return { success: false, error: response.statusText }

            const data = await response.json()
            return { success: true, data: Array.isArray(data) ? data : [] }
        } catch (error) {
            console.error('GestaoDS listAppointments error:', error)
            return { success: false, error: String(error) }
        }
    }
}

export interface GestaoDSResponse<T> {
    success: boolean
    data?: T
    error?: string
}
