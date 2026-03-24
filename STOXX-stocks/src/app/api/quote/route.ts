import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/api-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { getQuote, isMarketOpen, ValidationError } from '@/lib/yfinance-client'
import { z } from 'zod'

// Schema for query parameters
const querySchema = z.object({
  ticker: z.string().min(1, 'ticker is required').max(10, 'ticker too long'),
})

/**
 * GET /api/quote
 * yfinance-based quote endpoint with market hours check
 *
 * Returns real-time quote data including price, change, volume.
 * Checks if market is open (09:30-16:00 ET) and includes status.
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

    // Get quote from yfinance
    const quote = await getQuote(ticker)

    // Check market hours (09:30-16:00 ET)
    const marketOpen = isMarketOpen()

    // Transform to response format with market status
    const response = {
      ticker: quote.ticker,
      price: quote.price,
      change: quote.change,
      change_percent: quote.change_percent,
      timestamp: quote.timestamp,
      high: quote.high,
      low: quote.low,
      open: quote.open,
      previous_close: quote.previous_close,
      volume: quote.volume,
      status: marketOpen ? 'market_open' as const : 'market_closed' as const,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
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
    console.error('[Quote API Error]', error)

    return serverError(error)
  }
}