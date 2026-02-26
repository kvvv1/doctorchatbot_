import { NextResponse } from 'next/server'

/**
 * GET /api/webhooks/zapi/ping
 * 
 * Simple health check endpoint for testing webhook connectivity.
 * Returns 200 OK with a simple message.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Z-API webhook is ready',
    timestamp: new Date().toISOString(),
  })
}

/**
 * POST /api/webhooks/zapi/ping
 * 
 * Also handle POST requests for testing tools that prefer POST.
 */
export async function POST() {
  return NextResponse.json({
    ok: true,
    message: 'Z-API webhook is ready (POST)',
    timestamp: new Date().toISOString(),
  })
}
