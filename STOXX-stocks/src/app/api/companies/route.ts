import { NextRequest, NextResponse } from 'next/server'
import { companyRepository } from '@/lib/repositories/CompanyRepository'
import { serverError } from '@/lib/api-utils'
import type { CompanyFilters } from '@/types'

// Cache control header (1 hour)
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=600'

/**
 * GET /api/companies
 * Fetch companies with optional filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const filters: CompanyFilters = {}

    // Sector filter
    const sector = searchParams.get('sector')
    if (sector) {
      filters.sector = sector
    }

    // Country filter
    const country = searchParams.get('country')
    if (country) {
      filters.country = country
    }

    // Exchange filter
    const exchange = searchParams.get('exchange')
    if (exchange) {
      filters.exchange = exchange
    }

    // Distress filter
    const isDistressed = searchParams.get('is_distressed')
    if (isDistressed !== null) {
      filters.is_distressed = isDistressed === 'true'
    }

    // Search filter
    const search = searchParams.get('search')
    if (search) {
      filters.search = search
    }

    // Pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Fetch companies
    const { companies, total } = await companyRepository.findPaginated(
      filters,
      limit,
      offset
    )

    // Return response with cache headers
    return NextResponse.json(
      {
        companies,
        total,
        limit,
        offset,
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
