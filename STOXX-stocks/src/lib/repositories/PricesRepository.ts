import { getSupabaseAdmin } from './supabase-admin'
import type { Price } from '@/types'

export interface PriceQueryOptions {
  start_date?: string
  end_date?: string
  resolution?: 'daily' | '60min'
  limit?: number
}

/**
 * Repository for Price-related database operations
 */
export class PricesRepository {
  /**
   * Find price history for a ticker
   */
  async findByTicker(
    ticker: string,
    options?: PriceQueryOptions
  ): Promise<Price[]> {
    const {
      start_date,
      end_date,
      limit = 365,
    } = options || {}

    let query = getSupabaseAdmin()
      .from('prices')
      .select('*')
      .eq('ticker', ticker)
      .order('date', { ascending: false })
      .limit(limit)

    // Apply date filters
    if (start_date) {
      query = query.gte('date', start_date)
    }

    if (end_date) {
      query = query.lte('date', end_date)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching prices:', error)
      throw new Error(`Failed to fetch prices: ${error.message}`)
    }

    // Return in chronological order (oldest first)
    return (data || []).reverse()
  }

  /**
   * Get the latest price for a ticker
   */
  async getLatest(ticker: string): Promise<Price | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('prices')
      .select('*')
      .eq('ticker', ticker)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error fetching latest price:', error)
      throw new Error(`Failed to fetch latest price: ${error.message}`)
    }

    return data
  }

  /**
   * Get the most recent trading date
   */
  async getLatestDate(): Promise<string | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('prices')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching latest date:', error)
      throw new Error(`Failed to fetch latest date: ${error.message}`)
    }

    return data?.date || null
  }
}

// Export singleton instance
export const pricesRepository = new PricesRepository()
