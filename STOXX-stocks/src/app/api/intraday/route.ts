import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/api-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { getIntraday, ValidationError } from '@/lib/yfinance-client'
import { z } from 'zod'

// Schema for query parameters
const querySchema = z.object({
  ticker: z.string().min(1, 'ticker is required').max(10, 'ticker too long'),
})

/**
 * GET /api/intraday
 * yfinance-based intraday endpoint
 *
 * Returns 1-minute candle data for the current trading day.
 * Handles market_closed status when market is not open (09:30-16:00 ET).
 *
 * Rate limited: 60 requests/minute per IP.
 */
export async function GET(request: NextRequest) {
  // Rate limit check
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed, remaining, resetIn } = checkRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: `Rate limit exceeded. Retry in ${Math.ceil(resetIn / 1000)}s.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  try {
    const searchParams = request.nextUrl.searchParams

    // Parse and validate query parameters
    const params = {
      ticker: searchParams.get('ticker') || '',
    }

    const parsed = querySchema.safeParse(params)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { ticker } = parsed.data

    // Get intraday data from yfinance
    const intraday = await getIntraday(ticker)

    // Transform to response format
    const response = {
      ticker: intraday.ticker,
      status: intraday.status,
      message: intraday.message,
      data: intraday.data.map(point => ({
        timestamp: point.timestamp,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      })),
    }

    // Set cache headers based on market status
    const cacheHeader = intraday.status === 'market_open'
      ? 'public, s-maxage=30, stale-while-revalidate=15'
      : 'public, s-maxage=300, stale-while-revalidate=60'

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': cacheHeader,
        'X-RateLimit-Remaining': String(remaining),
      },
    })
  } catch (error) {
    // Handle validation errors from yfinance-client
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: 'Validation Error', message: error.message },
        { status: 400 }
      )
    }

    // Log unexpected errors
    console.error('[Intraday API Error]', error)

    return serverError(error)
  }
}