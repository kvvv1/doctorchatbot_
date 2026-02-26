/**
 * Internal Bot API - Create appointment from bot interaction
 * This is called server-side by the bot engine
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAppointmentFromBot } from '@/lib/services/botAppointmentService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, dayText, timeText } = body

    if (!conversationId || !dayText || !timeText) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Buscar informações da conversa
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('clinic_id, patient_name, patient_phone')
      .eq('id', conversationId)
      .single()

    if (error || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Criar appointment
    const result = await createAppointmentFromBot({
      conversationId,
      clinicId: conversation.clinic_id,
      patientName: conversation.patient_name,
      patientPhone: conversation.patient_phone,
      dayText,
      timeText,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      appointmentId: result.appointmentId,
      message: result.message,
    })
  } catch (error) {
    console.error('Error in bot appointment creation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
