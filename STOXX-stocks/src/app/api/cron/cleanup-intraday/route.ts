import { NextRequest, NextResponse } from 'next/server'
import { clearIntradayCache } from '@/lib/yfinance-client'

/**
 * Cron job: Cleanup intraday cache
 * 
 * Clears the in-memory intraday cache to force fresh data fetches
 * on the next request. Should run after market close to ensure clean state
 * for the next trading day.
 * 
 * Cron schedule: Every day at 5:00am UTC (before market open)
 * 
 * Security: Protected by CRON_SECRET header
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    console.error('CRON_SECRET not configured')
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 }
    )
  }

  if (cronSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Clear intraday cache
    const deletedCount = clearIntradayCache()

    console.log(`Cleared ${deletedCount} intraday cache entries`)

    return NextResponse.json({
      success: true,
      deleted_count: deletedCount,
      message: `Cleared ${deletedCount} intraday cache entries`
    })

  } catch (error) {
    console.error('Intraday cleanup error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: String(error) },
      { status: 500 }
    )
  }
}