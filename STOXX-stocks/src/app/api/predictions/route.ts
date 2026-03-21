import { NextRequest, NextResponse } from 'next/server'
import { predictionsRepository } from '@/lib/repositories/PredictionsRepository'
import { companyRepository } from '@/lib/repositories/CompanyRepository'
import { serverError } from '@/lib/api-utils'
import { z } from 'zod'

// Schema for request body
const createPredictionSchema = z.object({
  ticker: z.string().min(1, 'ticker is required'),
  model_version: z.string().min(1, 'model_version is required'),
  predicted_direction: z.boolean({
    required_error: 'predicted_direction is required',
    invalid_type_error: 'predicted_direction must be a boolean',
  }),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

// Cache control - no caching for predictions as they're dynamic
const CACHE_CONTROL = 'no-store'

/**
 * GET /api/predictions
 * Fetch predictions for a ticker
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ticker = searchParams.get('ticker')
    const days = searchParams.get('days')
      ? parseInt(searchParams.get('days')!)
      : undefined

    if (!ticker) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'ticker query parameter is required',
        },
        { status: 400 }
      )
    }

    const predictions = await predictionsRepository.findByTicker(ticker, days)

    return NextResponse.json(
      {
        ticker,
        predictions,
        count: predictions.length,
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

/**
 * POST /api/predictions
 * Create a new prediction
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Invalid JSON body',
        },
        { status: 400 }
      )
    }

    // Validate request body
    const parsed = createPredictionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { ticker, model_version, predicted_direction, confidence } = parsed.data

    // Validate ticker exists in our universe (M2: prevent noise data)
    const company = await companyRepository.findByTicker(ticker)
    if (!company) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: `Unknown ticker: '${ticker}'. Must be one of our 45 tracked companies.`,
        },
        { status: 400 }
      )
    }

    // Create the prediction
    const prediction = await predictionsRepository.create({
      ticker,
      model_version,
      predicted_direction,
      confidence,
    })

    return NextResponse.json(prediction, {
      status: 201,
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    })
  } catch (error) {
    console.error('Error in POST /api/predictions:', error)

    // Check for specific Supabase errors
    if (error instanceof Error && error.message.includes('Foreign key violation')) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid ticker or model_version - record not found',
        },
        { status: 400 }
      )
    }

    return serverError(error)
  }
}
