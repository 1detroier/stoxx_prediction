import { getSupabaseAdmin } from './supabase-admin'
import { escapeSearchTerm } from '@/lib/api-utils'
import type { Company, CompanyFilters } from '@/types'

/**
 * Repository for Company-related database operations
 */
export class CompanyRepository {
  /**
   * Find all companies with optional filters
   */
  async findAll(filters?: CompanyFilters): Promise<Company[]> {
    let query = getSupabaseAdmin()
      .from('companies')
      .select('*')
      .order('name', { ascending: true })

    // Apply sector filter
    if (filters?.sector) {
      query = query.eq('sector', filters.sector)
    }

    // Apply country filter
    if (filters?.country) {
      query = query.eq('country', filters.country)
    }

    // Apply exchange filter
    if (filters?.exchange) {
      query = query.eq('exchange', filters.exchange)
    }

    // Apply distress filter
    if (filters?.is_distressed !== undefined) {
      query = query.eq('is_distressed', filters.is_distressed)
    }

    // Apply search filter (searches name and ticker)
    if (filters?.search) {
      // Escape special LIKE chars to prevent pattern injection
      const safe = escapeSearchTerm(filters.search)
      const searchTerm = `%${safe}%`
      query = query.or(`name.ilike.${searchTerm},ticker.ilike.${searchTerm}`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching companies:', error)
      throw new Error(`Failed to fetch companies: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get total count of companies with optional filters
   */
  async count(filters?: CompanyFilters): Promise<number> {
    let query = getSupabaseAdmin()
      .from('companies')
      .select('*', { count: 'exact', head: true })

    if (filters?.sector) {
      query = query.eq('sector', filters.sector)
    }

    if (filters?.country) {
      query = query.eq('country', filters.country)
    }

    if (filters?.exchange) {
      query = query.eq('exchange', filters.exchange)
    }

    if (filters?.is_distressed !== undefined) {
      query = query.eq('is_distressed', filters.is_distressed)
    }

    if (filters?.search) {
      const safe = escapeSearchTerm(filters.search)
      const searchTerm = `%${safe}%`
      query = query.or(`name.ilike.${searchTerm},ticker.ilike.${searchTerm}`)
    }

    const { count, error } = await query

    if (error) {
      console.error('Error counting companies:', error)
      throw new Error(`Failed to count companies: ${error.message}`)
    }

    return count || 0
  }

  /**
   * Find a company by ticker symbol
   */
  async findByTicker(ticker: string): Promise<Company | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('companies')
      .select('*')
      .eq('ticker', ticker)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error fetching company by ticker:', error)
      throw new Error(`Failed to fetch company: ${error.message}`)
    }

    return data
  }

  /**
   * Find companies with pagination
   */
  async findPaginated(
    filters?: CompanyFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ companies: Company[]; total: number }> {
    const [companies, total] = await Promise.all([
      this.findAll(filters).then((companies) => companies.slice(offset, offset + limit)),
      this.count(filters),
    ])

    return { companies, total }
  }
}

// Export singleton instance
export const companyRepository = new CompanyRepository()
