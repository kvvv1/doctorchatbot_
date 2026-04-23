import { NextRequest, NextResponse } from 'next/server'
import { processPendingNotificationReminders } from '@/lib/services/appointmentNotificationService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleCronRequest(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = await processPendingNotificationReminders(100)

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
