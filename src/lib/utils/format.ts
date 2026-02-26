/**
 * Aplica máscara de telefone (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
export function maskPhone(value: string): string {
    if (!value) return ''

    // Remove tudo que não é número
    const digits = value.replace(/\D/g, '')

    // Limita a 11 dígitos
    const limited = digits.slice(0, 11)

    if (limited.length <= 2) {
        return limited.length > 0 ? `(${limited}` : ''
    }

    if (limited.length <= 6) {
        return `(${limited.slice(0, 2)}) ${limited.slice(2)}`
    }

    if (limited.length <= 10) {
        return `(${limited.slice(0, 2)}) ${limited.slice(2, 6)}-${limited.slice(6)}`
    }

    return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7)}`
}

/**
 * Remove máscara de qualquer string, mantendo apenas números
 */
export function unmask(value: string): string {
    return value.replace(/\D/g, '')
}

/**
 * Formata data no formato DD/MM/YYYY para exibição em inputs de texto
 */
export function maskDate(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8)

    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/**
 * Converte data DD/MM/YYYY para YYYY-MM-DD (formato do banco/API)
 */
export function parseBrazilianDate(dateStr: string): string {
    if (!dateStr) return ''
    const parts = dateStr.split('/')
    if (parts.length !== 3) return dateStr
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * Converte data YYYY-MM-DD para DD/MM/YYYY (formato visual)
 */
export function toBrazilianDate(dateStr: string): string {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    const [year, month, day] = parts
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
}

/**
 * Aplica máscara de hora formato 24h durante digitação
 * Formato: HH:mm (00:00 a 23:59)
 * @param value - Valor digitado
 * @returns Valor formatado com máscara
 */
export function maskTime24h(value: string): string {
    if (!value) return ''
    
    // Remove tudo exceto números e dois pontos
    const cleaned = value.replace(/[^0-9:]/g, '')
    
    // Se está vazio após limpeza, retorna vazio
    if (!cleaned) return ''
    
    // Se contém apenas números, formata HH:mm
    if (/^\d+$/.test(cleaned)) {
        const digits = cleaned.slice(0, 4)
        
        if (digits.length <= 2) {
            // Apenas horas (00-23)
            const hours = parseInt(digits, 10)
            if (hours > 23) {
                return digits.slice(0, 1)
            }
            return digits
        }
        
        if (digits.length <= 4) {
            // Horas e minutos
            const hours = digits.slice(0, 2)
            const minutes = digits.slice(2)
            
            // Valida horas (00-23)
            const hoursNum = parseInt(hours, 10)
            if (hoursNum > 23) {
                return hours.slice(0, 1)
            }
            
            // Valida minutos (00-59)
            const minutesNum = parseInt(minutes, 10)
            if (minutesNum > 59) {
                return `${hours}:${minutes.slice(0, 1)}`
            }
            
            return `${hours}:${minutes}`
        }
    }
    
    // Se já tem formato HH:mm ou HH:m
    const timeMatch = cleaned.match(/^(\d{1,2}):?(\d{0,2})$/)
    if (timeMatch) {
        let hours = timeMatch[1]
        let minutes = timeMatch[2] || ''
        
        // Valida e ajusta horas (00-23)
        const hoursNum = parseInt(hours, 10)
        if (hoursNum > 23) {
            hours = hours.slice(0, 1)
            if (parseInt(hours, 10) > 2) {
                hours = '0'
            }
        }
        
        // Garante 2 dígitos nas horas
        if (hours.length === 1 && parseInt(hours, 10) > 2) {
            hours = '0' + hours
        }
        
        // Processa minutos
        if (minutes.length > 0) {
            // Limita a 2 dígitos
            minutes = minutes.slice(0, 2)
            
            // Valida minutos (00-59)
            const minutesNum = parseInt(minutes, 10)
            if (minutesNum > 59) {
                if (minutes.length === 2) {
                    minutes = minutes[0] + '0'
                } else {
                    minutes = '0' + minutes
                }
            }
            
            // Garante 2 dígitos nos minutos quando completo
            if (minutes.length === 1 && parseInt(minutes, 10) < 6) {
                // Permite digitação parcial
            } else if (minutes.length === 1) {
                minutes = '0' + minutes
            }
        }
        
        // Monta resultado
        if (!minutes) {
            return hours
        }
        
        if (minutes.length === 1) {
            return `${hours}:${minutes}`
        }
        
        return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
    }
    
    // Retorna valor original se não conseguiu processar
    return value
}

/**
 * Converte hora formato 24h (HH:mm) para formato 12h (HH:MM AM/PM)
 * @param time24h - Hora no formato 24h (ex: "14:30", "09:00")
 * @returns Hora no formato 12h (ex: "02:30 PM", "09:00 AM")
 */
export function formatTime12h(time24h: string): string {
    if (!time24h) return ''
    
    const [hours, minutes] = time24h.split(':').map(Number)
    if (isNaN(hours) || isNaN(minutes)) return time24h
    
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    
    return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Converte hora formato 12h (HH:MM AM/PM) para formato 24h (HH:mm)
 * @param time12h - Hora no formato 12h (ex: "02:30 PM", "09:00 AM")
 * @returns Hora no formato 24h (ex: "14:30", "09:00")
 */
export function parseTime12h(time12h: string): string {
    if (!time12h) return ''
    
    // Remove espaços extras e converte para maiúsculas
    const cleaned = time12h.trim().toUpperCase()
    
    // Regex para capturar HH:MM AM/PM
    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
    if (!match) return time12h
    
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const period = match[3]
    
    // Validação
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
        return time12h
    }
    
    // Conversão para 24h
    if (period === 'PM' && hours !== 12) {
        hours += 12
    } else if (period === 'AM' && hours === 12) {
        hours = 0
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Aplica máscara de hora formato 12h durante digitação
 * Formato: HH:MM AM/PM
 * Força sempre formato 12h independente do sistema operacional
 * @param value - Valor digitado
 * @returns Valor formatado com máscara
 */
export function maskTime12h(value: string): string {
    if (!value) return ''
    
    // Converte para maiúsculas e preserva dois pontos e espaços
    const upper = value.toUpperCase()
    
    // Extrai números, dois pontos, espaços e letras A/P/M
    const cleaned = upper.replace(/[^0-9:\sAPM]/g, '')
    
    // Se está vazio após limpeza, retorna vazio
    if (!cleaned.trim()) return ''
    
    // Remove espaços extras
    const normalized = cleaned.replace(/\s+/g, ' ').trim()
    
    // Tenta fazer match com diferentes formatos
    // Formato completo: HH:MM AM/PM ou HH:MMAM/PM
    const fullMatch = normalized.match(/^(\d{1,2}):?(\d{0,2})\s*(AM|PM|A|P)?\s*$/i)
    if (fullMatch) {
        let hours = fullMatch[1]
        let minutes = fullMatch[2] || ''
        let period = (fullMatch[3] || '').toUpperCase()
        
        // Converte horas para número
        let hoursNum = parseInt(hours, 10)
        
        // Se horas estão em formato 24h (13-23), converte para 12h
        if (hoursNum > 12 && hoursNum <= 23) {
            hoursNum = hoursNum - 12
            if (!period) period = 'PM'
        } else if (hoursNum === 0) {
            hoursNum = 12
            if (!period) period = 'AM'
        } else if (hoursNum === 12) {
            if (!period) period = 'PM'
        }
        
        // Valida horas (deve ser 1-12)
        if (hoursNum < 1 || hoursNum > 12) {
            // Se digitou número inválido, mantém apenas o primeiro dígito válido
            if (hoursNum > 12) {
                hoursNum = parseInt(hours[0], 10)
                if (hoursNum > 1) hoursNum = 1
            } else {
                return hours.slice(0, 1)
            }
        }
        
        hours = hoursNum.toString()
        
        // Processa minutos
        if (minutes.length > 0) {
            // Limita a 2 dígitos
            minutes = minutes.slice(0, 2)
            
            // Valida minutos (00-59)
            const minutesNum = parseInt(minutes, 10)
            if (minutesNum > 59) {
                // Se minutos inválidos, ajusta
                if (minutes.length === 2) {
                    minutes = minutes[0] + '0'
                } else {
                    minutes = '0' + minutes
                }
            }
            
            // Garante 2 dígitos nos minutos
            if (minutes.length === 1 && parseInt(minutes, 10) < 6) {
                // Permite digitação parcial
            } else if (minutes.length === 1) {
                minutes = '0' + minutes
            }
        }
        
        // Processa período
        if (period) {
            if (period.startsWith('A')) {
                period = 'AM'
            } else if (period.startsWith('P')) {
                period = 'PM'
            } else {
                period = ''
            }
        }
        
        // Monta resultado progressivamente
        if (!minutes) {
            // Apenas horas
            return hours
        }
        
        if (minutes.length === 1) {
            // Horas e primeiro dígito de minutos
            return `${hours}:${minutes}`
        }
        
        // Horas e minutos completos
        const timeStr = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
        
        if (period) {
            return `${timeStr} ${period}`
        }
        
        return timeStr
    }
    
    // Se não fez match, tenta processar apenas números
    const digitsOnly = cleaned.replace(/[^0-9]/g, '')
    if (digitsOnly.length > 0 && digitsOnly.length <= 4) {
        const digits = digitsOnly.slice(0, 4)
        
        if (digits.length <= 2) {
            // Apenas horas (1-12)
            const h = parseInt(digits, 10)
            if (h > 12) {
                return digits.slice(0, 1)
            }
            return digits
        }
        
        // Horas e minutos
        const hours = digits.slice(0, 2)
        const minutes = digits.slice(2)
        
        const hoursNum = parseInt(hours, 10)
        if (hoursNum < 1 || hoursNum > 12) {
            // Se horas inválidas, ajusta
            if (hoursNum > 12) {
                const h1 = parseInt(hours[0], 10)
                if (h1 > 1) {
                    return hours[0]
                }
                return hours.slice(0, 1)
            }
            return hours.slice(0, 1)
        }
        
        const minutesNum = parseInt(minutes, 10)
        if (minutesNum > 59) {
            return `${hours}:${minutes[0]}`
        }
        
        return `${hours}:${minutes}`
    }
    
    // Retorna valor original se não conseguiu processar
    return value
}

