import { NextRequest, NextResponse } from 'next/server'
import {
  processPendingNotificationReminders,
  resendInteractiveReminderButtons,
} from '@/lib/services/appointmentNotificationService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleCronRequest(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let action = 'process_pending'
    let limit = 100

    if (request.method === 'POST') {
      const rawBody = await request.text()

      if (rawBody.trim().length > 0) {
        try {
          const body = JSON.parse(rawBody) as { action?: string; limit?: number }
          action = body.action || action
          limit = body.limit || limit
        } catch {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
      }
    }

    if (action === 'resend_interactive_24h') {
      const results = await resendInteractiveReminderButtons({
        type: 'appointment_24h',
        limit,
      })

      return NextResponse.json({
        success: true,
        action,
        processed: results.processed,
        sent: results.sent,
        failed: results.failed,
        errors: results.errors,
      })
    }

    const results = await processPendingNotificationReminders(limit)

    if (results.processed === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
        message: 'No pending reminders',
      })
    }

    return NextResponse.json({
      success: true,
      processed: results.processed,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors,
    })
  } catch (error) {
    console.error('CRON job error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request)
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request)
}
