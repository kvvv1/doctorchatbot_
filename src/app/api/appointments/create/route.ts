/**
 * Create Appointment Route
 * Creates an appointment and optionally creates a Google Calendar event
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCalendarEvent } from '@/lib/calendar/googleCalendar'
import { checkAppointmentConflicts, checkWorkingHours, checkTimeOff } from '@/lib/services/appointmentConflictService'

interface CreateAppointmentBody {
	conversationId?: string
	patientPhone: string
	patientName: string
	startsAt: string // ISO date string
	durationMinutes?: number
	endsAt?: string // Alternative to durationMinutes
	description?: string
	professionalId?: string
	resourceId?: string
}

export async function POST(request: NextRequest) {
	try {
		const supabase = await createClient()
		const {
			data: { user },
		} = await supabase.auth.getUser()

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Get user's clinic_id
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('clinic_id')
			.eq('id', user.id)
			.single()

		if (profileError || !profile) {
			return NextResponse.json(
				{ error: 'Profile not found' },
				{ status: 404 }
			)
		}

		// Parse request body
		const body: CreateAppointmentBody = await request.json()

		// Validate required fields
		if (
			!body.patientPhone ||
			!body.patientName ||
			!body.startsAt ||
			(!body.durationMinutes && !body.endsAt)
		) {
			return NextResponse.json(
				{ error: 'Missing required fields' },
				{ status: 400 }
			)
		}

		// Calculate end time
		const startsAt = new Date(body.startsAt)
		const endsAt = body.endsAt 
			? new Date(body.endsAt) 
			: new Date(startsAt.getTime() + (body.durationMinutes || 30) * 60000)

		// Validar conflitos de horário
		const conflictCheck = await checkAppointmentConflicts(
			profile.clinic_id,
			startsAt,
			endsAt,
			body.professionalId || null,
			body.resourceId || null
		)

		if (conflictCheck.hasConflict) {
			return NextResponse.json(
				{
					error: 'Conflito de horário',
					message: 'Já existe um agendamento neste horário',
					conflicts: conflictCheck.conflictingAppointments,
				},
				{ status: 409 }
			)
		}

		// Verificar se está em horário de funcionamento
		const isWorkingHours = await checkWorkingHours(profile.clinic_id, startsAt)
		if (!isWorkingHours) {
			return NextResponse.json(
				{
					error: 'Fora do horário de funcionamento',
					message: 'Este horário está fora do horário de funcionamento',
				},
				{ status: 400 }
			)
		}

		// Verificar se está em período de folga
		const isTimeOff = await checkTimeOff(profile.clinic_id, startsAt)
		if (isTimeOff) {
			return NextResponse.json(
				{
					error: 'Data indisponível',
					message: 'Esta data está marcada como folga',
				},
				{ status: 400 }
			)
		}

		// Create appointment in database
		const { data: appointment, error: appointmentError } = await supabase
			.from('appointments')
			.insert({
				clinic_id: profile.clinic_id,
				conversation_id: body.conversationId || null,
				patient_phone: body.patientPhone,
				patient_name: body.patientName,
				starts_at: startsAt.toISOString(),
				ends_at: endsAt.toISOString(),
				status: 'scheduled',
				description: body.description || null,
				provider: body.conversationId ? 'manual' : 'google',
				professional_id: body.professionalId || null,
				resource_id: body.resourceId || null,
			})
			.select()
			.single()

		if (appointmentError || !appointment) {
			console.error('Error creating appointment:', appointmentError)
			return NextResponse.json(
				{ error: 'Failed to create appointment' },
				{ status: 500 }
			)
		}

		// Update conversation status to scheduled (if conversation exists)
		if (body.conversationId) {
			const { error: conversationError } = await supabase
				.from('conversations')
				.update({
					status: 'scheduled',
					updated_at: new Date().toISOString(),
				})
				.eq('id', body.conversationId)

			if (conversationError) {
				console.error('Error updating conversation:', conversationError)
				// Continue even if this fails
			}
		}

		// Try to create Google Calendar event
		let eventCreated = false
		let eventError: string | null = null

		try {
			// Get calendar integration
			const { data: integration } = await supabase
				.from('calendar_integrations')
				.select('*')
				.eq('clinic_id', profile.clinic_id)
				.eq('is_connected', true)
				.single()

			if (
				integration &&
				integration.google_access_token &&
				integration.google_refresh_token
			) {
				// Create event in Google Calendar
				const eventId = await createCalendarEvent({
					accessToken: integration.google_access_token,
					refreshToken: integration.google_refresh_token,
					calendarId: integration.google_calendar_id || 'primary',
					title: `Consulta - ${body.patientName}`,
					startsAt,
					endsAt,
					description: body.description || `Paciente: ${body.patientName}\nTelefone: ${body.patientPhone}`,
					patientPhone: body.patientPhone,
				})

				// Update appointment with event ID
				await supabase
					.from('appointments')
					.update({
						provider_reference_id: eventId,
					})
					.eq('id', appointment.id)

				eventCreated = true
			}
		} catch (error: unknown) {
			console.error('Error creating calendar event:', error)
			if (error instanceof Error) {
				eventError = error.message
			} else {
				eventError = 'Failed to create calendar event'
			}
		}

		return NextResponse.json({
			success: true,
			appointment,
			eventCreated,
			eventError,
		})
	} catch (error) {
		console.error('Error in create appointment route:', error)
		return NextResponse.json(
			{ error: 'Failed to create appointment' },
			{ status: 500 }
		)
	}
}
