import { NextRequest, NextResponse } from 'next/server'
import { pricesRepository } from '@/lib/repositories/PricesRepository'
import { serverError } from '@/lib/api-utils'
import { z } from 'zod'

// Schema for query parameters
const querySchema = z.object({
  ticker: z.string().min(1, 'ticker is required'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  resolution: z.enum(['daily', '60min']).optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(365),
})

// Cache control header (5 minutes for recent data)
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=60'

/**
 * GET /api/prices
 * Fetch price history for a ticker
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse and validate query parameters
    const params = {
      ticker: searchParams.get('ticker') || '',
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      resolution: searchParams.get('resolution') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
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

    const { ticker, start_date, end_date, resolution, limit } = parsed.data

    // Validate date formats if provided
    if (start_date && isNaN(Date.parse(start_date))) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'start_date must be a valid ISO date string',
        },
        { status: 400 }
      )
    }

    if (end_date && isNaN(Date.parse(end_date))) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'end_date must be a valid ISO date string',
        },
        { status: 400 }
      )
    }

    // Note: resolution parameter is accepted for future use
    // Currently only daily resolution is supported
    if (resolution && resolution !== 'daily') {
      return NextResponse.json(
        {
          error: 'Not Implemented',
          message: 'Only daily resolution is currently supported',
        },
        { status: 501 }
      )
    }

    // Fetch prices
    const prices = await pricesRepository.findByTicker(ticker, {
      start_date,
      end_date,
      limit,
    })

    // Return response
    return NextResponse.json(
      {
        ticker,
        prices,
        count: prices.length,
      },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL,
        },
      }
    )
  } catch (error) {
    return serverError(error)
  }
}
