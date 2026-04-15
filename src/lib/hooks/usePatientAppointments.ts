'use client'

import { useEffect, useState } from 'react'
import type { Appointment } from '@/lib/types/database'

interface UsePatientAppointmentsOptions {
	patientPhone?: string | null
	enabled?: boolean
}

export function usePatientAppointments({
	patientPhone,
	enabled = true,
}: UsePatientAppointmentsOptions) {
	const [appointments, setAppointments] = useState<Appointment[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !patientPhone) {
			setAppointments([])
			setLoading(false)
			return
		}

		let active = true

		const fetchAppointments = async () => {
			try {
				setLoading(true)
				const query = new URLSearchParams({
					patient_phone: patientPhone,
				})
				const response = await fetch(`/api/appointments/list?${query}`, {
					cache: 'no-store',
				})

				if (!response.ok) {
					throw new Error('Falha ao buscar agendamentos')
				}

				const data = await response.json()
				if (!active) return

				setAppointments(data.appointments || [])
				setError(null)
			} catch (fetchError) {
				console.error('Error fetching patient appointments:', fetchError)
				if (active) {
					setError(
						fetchError instanceof Error
							? fetchError.message
							: 'Falha ao buscar agendamentos',
					)
				}
			} finally {
				if (active) {
					setLoading(false)
				}
			}
		}

		void fetchAppointments()

		return () => {
			active = false
		}
	}, [enabled, patientPhone])

	return {
		appointments,
		loading,
		error,
	}
}
