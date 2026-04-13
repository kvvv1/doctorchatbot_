/**
 * Create Appointment Route
 * Creates an appointment and optionally creates a Google Calendar event
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAppointmentConflicts, checkWorkingHours, checkTimeOff } from '@/lib/services/appointmentConflictService'
import { createExternalAppointment } from '@/lib/integrations/integrationRouter'

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
	/** CPF do paciente – obrigatório para integração GestaoDS quando não há conversa vinculada */
	cpf?: string
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
				provider: 'manual',
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

		// Try to sync with external integration via integration router
		let eventCreated = false
		let eventError: string | null = null

		try {
			const externalResult = await createExternalAppointment({
				supabase,
				clinicId: profile.clinic_id,
				patientName: body.patientName,
				patientPhone: body.patientPhone,
				startsAt,
				endsAt,
				description: body.description,
				conversationId: body.conversationId,
				cpf: body.cpf,
			})

			if (externalResult.synced && externalResult.providerReferenceId) {
				await supabase
					.from('appointments')
					.update({
						provider: externalResult.provider,
						provider_reference_id: externalResult.providerReferenceId,
					})
					.eq('id', appointment.id)

				eventCreated = true
			}

			if (externalResult.error) {
				eventError = externalResult.error
			}
		} catch (error: unknown) {
			console.error('Error syncing external integration:', error)
			if (error instanceof Error) {
				eventError = error.message
			} else {
				eventError = 'Failed to sync external integration'
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
