/**
 * Formata a data atual em português brasileiro
 * @param date - Data a ser formatada (padrão: agora)
 * @param format - 'full' para formato completo, 'short' para mobile
 * @returns String formatada
 */
export function formatDatePTBR(date: Date = new Date(), format: 'full' | 'short' = 'full'): string {
	const weekdays = [
		'domingo',
		'segunda-feira',
		'terça-feira',
		'quarta-feira',
		'quinta-feira',
		'sexta-feira',
		'sábado',
	]
	
	const weekdaysShort = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
	
	const months = [
		'janeiro',
		'fevereiro',
		'março',
		'abril',
		'maio',
		'junho',
		'julho',
		'agosto',
		'setembro',
		'outubro',
		'novembro',
		'dezembro',
	]
	
	const monthsShort = [
		'jan',
		'fev',
		'mar',
		'abr',
		'mai',
		'jun',
		'jul',
		'ago',
		'set',
		'out',
		'nov',
		'dez',
	]
	
	const day = date.getDate()
	const month = date.getMonth()
	const year = date.getFullYear()
	const weekday = date.getDay()
	const hours = date.getHours().toString().padStart(2, '0')
	const minutes = date.getMinutes().toString().padStart(2, '0')
	
	if (format === 'short') {
		// seg, 16 fev • 19:21
		return `${weekdaysShort[weekday]}, ${day} ${monthsShort[month]} • ${hours}:${minutes}`
	}
	
	// segunda-feira, 16 de fevereiro de 2026 às 19:21
	return `${weekdays[weekday]}, ${day} de ${months[month]} de ${year} às ${hours}:${minutes}`
}

/**
 * Configuração padrão de horário de trabalho
 */
export interface WorkSchedule {
	work_days: number[] // 0=domingo, 1=segunda, ..., 6=sábado
	work_start: string // formato "HH:MM"
	work_end: string // formato "HH:MM"
}

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
	work_days: [1, 2, 3, 4, 5], // segunda a sexta
	work_start: '08:00',
	work_end: '18:00',
}

/**
 * Verifica se está dentro do horário de trabalho
 * @param schedule - Configuração de horário (usa padrão se não fornecido)
 * @param date - Data a verificar (padrão: agora)
 * @returns true se estiver dentro do horário de trabalho
 */
export function isWithinWorkHours(
	schedule: WorkSchedule = DEFAULT_WORK_SCHEDULE,
	date: Date = new Date()
): boolean {
	const currentDay = date.getDay()
	const currentHours = date.getHours()
	const currentMinutes = date.getMinutes()
	const currentTime = currentHours * 60 + currentMinutes
	
	// Verifica se é um dia de trabalho
	if (!schedule.work_days.includes(currentDay)) {
		return false
	}
	
	// Parse start time
	const [startHour, startMinute] = schedule.work_start.split(':').map(Number)
	const startTime = startHour * 60 + startMinute
	
	// Parse end time
	const [endHour, endMinute] = schedule.work_end.split(':').map(Number)
	const endTime = endHour * 60 + endMinute
	
	// Verifica se está dentro do horário
	return currentTime >= startTime && currentTime < endTime
}
