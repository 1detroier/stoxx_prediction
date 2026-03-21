import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/api-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

// Schema for query parameters
const querySchema = z.object({
  symbol: z.string().min(1, 'symbol is required'),
})

const FINNHUB_API_URL = 'https://finnhub.io/api/v1/quote'

/**
 * GET /api/finnhub/quote
 * Proxy endpoint for Finnhub quote API
 *
 * Rate limited: 60 requests/minute per IP (protects Finnhub quota).
 * FINNHUB_API_KEY is server-side only — never exposed to client.
 */
export async function GET(request: NextRequest) {
  // Rate limit check (M1)
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
      symbol: searchParams.get('symbol') || '',
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

    const { symbol } = parsed.data

    // Get Finnhub API key from server-side environment
    const finnhubApiKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY

    if (!finnhubApiKey) {
      console.error('Finnhub API key not configured')
      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'External API not configured',
        },
        { status: 503 }
      )
    }

    // Build Finnhub API URL
    const url = new URL(FINNHUB_API_URL)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('token', finnhubApiKey)

    // Fetch from Finnhub
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      // Next.js cache configuration
      next: { revalidate: 60 }, // Cache for 60 seconds
    })

    if (!response.ok) {
      console.error(`Finnhub API error: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        {
          error: 'External API Error',
          message: `Failed to fetch quote: ${response.statusText}`,
        },
        { status: 503 }
      )
    }

    const data = await response.json()

    // Check if Finnhub returned an error
    if (data.error) {
      console.error('Finnhub API error:', data.error)
      return NextResponse.json(
        {
          error: 'External API Error',
          message: data.error,
        },
        { status: 502 }
      )
    }

    // Transform response to match our API contract
    // Finnhub returns: { c, d, dp, h, l, o, pc, t }
    // We return: { symbol, price, change, change_percent, timestamp }
    const result = {
      symbol,
      price: data.c ?? 0,
      change: data.d ?? 0,
      change_percent: data.dp ?? 0,
      timestamp: data.t ?? 0,
      // Include additional fields for client convenience
      high: data.h ?? 0,
      low: data.l ?? 0,
      open: data.o ?? 0,
      previous_close: data.pc ?? 0,
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Note': 'Finnhub free tier: 60 calls/minute',
      },
    })
  } catch (error) {
    return serverError(error)
  }
}
