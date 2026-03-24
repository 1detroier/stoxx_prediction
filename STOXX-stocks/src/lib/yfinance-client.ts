// ============================================
// Yahoo Finance Client (yahoo-finance2) with Caching
// ============================================
//
// Shared wrapper for Yahoo Finance API with:
// - In-memory caching (5-min TTL quotes, 1-min TTL intraday)
// - Rate limiting retry logic
// - Market hours detection (US Eastern Time)
// - Type-safe responses

import YahooFinance from 'yahoo-finance2'
import { getTimezoneForTicker, calculateIntradayPeriod1 } from './timezones'

// Create an instance of Yahoo Finance client
const yahooFinance = new YahooFinance()

// ============================================
// Types
// ============================================

export interface QuoteData {
  ticker: string
  price: number
  change: number
  change_percent: number
  timestamp: number
  high: number
  low: number
  open: number
  previous_close: number
  volume: number
}

export interface HistoricalDataPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoricalData {
  ticker: string
  data: HistoricalDataPoint[]
}

export interface IntradayDataPoint {
  timestamp: string  // ISO 8601
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IntradayData {
  ticker: string
  status: 'market_open' | 'market_closed'
  message?: string
  data: IntradayDataPoint[]
}

// ============================================
// Cache Implementation
// ============================================

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup expired entries every minute
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000)
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    })
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  // For cron cleanup - clear all intraday data
  clearIntraday(): number {
    let count = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith('intraday:')) {
        this.cache.delete(key)
        count++
      }
    }
    return count
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }
}

// Singleton cache instance
const cache = new CacheManager()

// Cache TTLs
const QUOTE_TTL_MS = 5 * 60 * 1000      // 5 minutes
const INTRADAY_TTL_MS = 60 * 1000       // 1 minute
const HISTORICAL_TTL_MS = 15 * 60 * 1000 // 15 minutes for historical

// ============================================
// Market Hours Detection
// ============================================

/**
 * Check if a ticker is a US stock.
 * US stocks have no suffix or end with .US
 * European stocks have suffixes like .SW, .DE, .PA, .LS, etc.
 */
export function isUSTicker(ticker: string): boolean {
  const normalized = ticker.toUpperCase().trim()
  
  // Check if ticker ends with a known European suffix
  const europeanSuffixes = ['.SW', '.DE', '.PA', '.LS', '.TO', '.VI', '.OL', '.HE', '.AX', '.NZ']
  for (const suffix of europeanSuffixes) {
    if (normalized.endsWith(suffix)) {
      return false
    }
  }
  
  // US tickers: no suffix or .US suffix
  return true
}

/**
 * Check if US stock market is currently open.
 * Market hours: 09:30 - 16:00 ET (Monday-Friday)
 * @param ticker - Optional ticker to check if it's a US stock
 *              - If ticker provided and is NOT a US ticker, returns true (skip market hours check)
 *              - If ticker is US ticker or no ticker provided, uses US market hours logic
 */
export function isMarketOpen(ticker?: string): boolean {
  // If ticker is provided and it's not a US ticker, skip market hours check
  // (European markets have different hours, so we allow intraday data)
  if (ticker !== undefined && !isUSTicker(ticker)) {
    return true
  }
  
  const now = new Date()
  
  // Get current time in US Eastern Time
  const etTime = toEasternTime(now)
  
  // Check if weekend
  const dayOfWeek = etTime.getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false
  }
  
  const hours = etTime.getHours()
  const minutes = etTime.getMinutes()
  const totalMinutes = hours * 60 + minutes
  
  // Market opens at 9:30 AM ET (570 minutes)
  // Market closes at 4:00 PM ET (960 minutes)
  const marketOpen = 9 * 60 + 30  // 570
  const marketClose = 16 * 60     // 960
  
  return totalMinutes >= marketOpen && totalMinutes < marketClose
}

/**
 * Convert a Date to US Eastern Time
 */
function toEasternTime(date: Date): Date {
  // This is a simplified conversion
  // For production, use a proper timezone library like 'date-fns-tz'
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  // Eastern Time is UTC-5 (EST) or UTC-4 (EDT)
  // Simplified: assume EST/EDT based on month
  const month = date.getMonth()
  const easternOffset = (month >= 3 && month <= 10) ? -4 : -5 // EDT Apr-Oct, EST otherwise
  return new Date(utc + (easternOffset * 3600000))
}

/**
 * Get market status with message
 * @param ticker - Optional ticker to check if it's a US stock
 */
export function getMarketStatus(ticker?: string): { 
  status: 'market_open' | 'market_closed'
  message?: string 
} {
  if (isMarketOpen(ticker)) {
    return { status: 'market_open' }
  }
  return { 
    status: 'market_closed',
    message: 'The stock market has not opened yet.'
  }
}

// ============================================
// Retry Logic
// ============================================

interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      // Don't retry on certain errors
      if (error instanceof ValidationError) {
        throw error
      }
      
      if (attempt < opts.maxRetries - 1) {
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(2, attempt),
          opts.maxDelayMs
        )
        await sleep(delay)
      }
    }
  }
  
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Custom error types
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

// ============================================
// Yahoo Finance Functions (using yahoo-finance2)
// ============================================

/**
 * Get real-time quote for a ticker.
 * Uses 5-minute cache.
 */
export async function getQuote(ticker: string): Promise<QuoteData> {
  if (!ticker || typeof ticker !== 'string') {
    throw new ValidationError('Ticker is required')
  }
  
  const normalizedTicker = ticker.toUpperCase().trim()
  const cacheKey = `quote:${normalizedTicker}`
  
  // Check cache first
  const cached = cache.get<QuoteData>(cacheKey)
  if (cached) {
    return cached
  }
  
  return withRetry(async () => {
    const quote = await yahooFinance.quote(normalizedTicker)
    
    if (!quote || Object.keys(quote).length === 0) {
      // Invalid ticker - return empty quote with defaults
      return {
        ticker: normalizedTicker,
        price: 0,
        change: 0,
        change_percent: 0,
        timestamp: Date.now(),
        high: 0,
        low: 0,
        open: 0,
        previous_close: 0,
        volume: 0,
      }
    }
    
    const price = quote.regularMarketPrice ?? quote.previousClose ?? 0
    const previousClose = quote.previousClose ?? price
    const change = price - previousClose
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0
    
    const quoteData: QuoteData = {
      ticker: normalizedTicker,
      price,
      change,
      change_percent: changePercent,
      timestamp: Date.now(),
      high: quote.regularMarketDayHigh ?? 0,
      low: quote.regularMarketDayLow ?? 0,
      open: quote.regularMarketOpen ?? 0,
      previous_close: previousClose,
      volume: quote.regularMarketVolume ?? 0,
    }
    
    // Cache the result
    cache.set(cacheKey, quoteData, QUOTE_TTL_MS)
    
    return quoteData
  })
}

/**
 * Get historical daily data for a ticker.
 * Uses 15-minute cache.
 */
export async function getHistorical(
  ticker: string,
  startDate: string,
  endDate?: string
): Promise<HistoricalData> {
  if (!ticker || typeof ticker !== 'string') {
    throw new ValidationError('Ticker is required')
  }
  
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new ValidationError('startDate must be in YYYY-MM-DD format')
  }
  
  const normalizedTicker = ticker.toUpperCase().trim()
  const end = endDate || new Date().toISOString().split('T')[0]
  const cacheKey = `historical:${normalizedTicker}:${startDate}:${end}`
  
  // Check cache first
  const cached = cache.get<HistoricalData>(cacheKey)
  if (cached) {
    return cached
  }
  
  return withRetry(async () => {
    const history = await yahooFinance.historical(normalizedTicker, {
      period1: startDate,
      period2: end,
      interval: '1d',
    })
    
    if (!history || history.length === 0) {
      return {
        ticker: normalizedTicker,
        data: [],
      }
    }
    
    // yahoo-finance2 returns array of historical result objects
    const data: HistoricalDataPoint[] = history.map((row) => ({
      date: typeof row.date === 'object' && row.date !== null && 'toISOString' in row.date 
        ? (row.date as Date).toISOString().split('T')[0]
        : String(row.date ?? '').split('T')[0],
      open: Number(row.open ?? 0),
      high: Number(row.high ?? 0),
      low: Number(row.low ?? 0),
      close: Number(row.close ?? 0),
      volume: Number(row.volume ?? 0),
    }))
    
    const result: HistoricalData = {
      ticker: normalizedTicker,
      data,
    }
    
    // Cache the result
    cache.set(cacheKey, result, HISTORICAL_TTL_MS)
    
    return result
  })
}

/**
 * Get intraday 1-minute data for the current trading day.
 * Uses 1-minute cache. Returns empty data if market is closed.
 * 
 * @param ticker - Stock ticker symbol (e.g., "AAPL", "ABBN.SW")
 * @param timezone - Optional IANA timezone string (e.g., "Europe/Zurich")
 *                    If not provided, will be determined from ticker suffix
 */
export async function getIntraday(ticker: string, timezone?: string): Promise<IntradayData> {
  if (!ticker || typeof ticker !== 'string') {
    throw new ValidationError('Ticker is required')
  }
  
  const normalizedTicker = ticker.toUpperCase().trim()
  
  // Determine timezone: use provided or derive from ticker
  const tz = timezone ?? getTimezoneForTicker(normalizedTicker)
  
  // Check market status first (pass ticker for correct market hours check)
  const marketStatus = getMarketStatus(normalizedTicker)
  
  if (marketStatus.status === 'market_closed') {
    return {
      ticker: normalizedTicker,
      status: 'market_closed',
      message: marketStatus.message,
      data: [],
    }
  }
  
  const cacheKey = `intraday:${normalizedTicker}`
  
  // Check cache first
  const cached = cache.get<IntradayData>(cacheKey)
  if (cached) {
    return cached
  }
  
  return withRetry(async () => {
    // For intraday, get today's data using chart API (supports 1m interval)
    // Calculate period1 based on timezone - market open time
    const now = new Date()
    const period1 = calculateIntradayPeriod1(tz)
    
    // Use try-catch to handle any chart API errors
    let chartResult: Record<string, unknown> = {}
    try {
      chartResult = (await yahooFinance.chart(normalizedTicker, {
        period1,
        period2: now,
        interval: '1m',
      })) as unknown as Record<string, unknown>
    } catch (chartError) {
      console.warn(`Chart API failed for ${normalizedTicker}:`, chartError)
    }
    
    // Safely extract chart data
    const chartObj = chartResult.chart as Record<string, unknown> | undefined
    const resultArray = chartObj?.result as unknown[] | undefined
    const chartData = resultArray?.[0] as Record<string, unknown> | undefined
    
    const timestamps = (chartData?.timestamp as number[] | undefined) ?? []
    const quoteArr = (chartData?.indicators as Record<string, unknown>)?.quote as unknown[] | undefined
    const quoteData = quoteArr?.[0] as Record<string, number[]> | undefined
    
    if (!timestamps.length || !quoteData) {
      const result: IntradayData = {
        ticker: normalizedTicker,
        status: 'market_open',
        data: [],
      }
      cache.set(cacheKey, result, INTRADAY_TTL_MS)
      return result
    }
    
    const data: IntradayDataPoint[] = timestamps.map((ts, i) => ({
      timestamp: new Date(ts * 1000).toISOString(),
      open: Number(quoteData.open[i] ?? 0),
      high: Number(quoteData.high[i] ?? 0),
      low: Number(quoteData.low[i] ?? 0),
      close: Number(quoteData.close[i] ?? 0),
      volume: Number(quoteData.volume[i] ?? 0),
    }))
    
    const result: IntradayData = {
      ticker: normalizedTicker,
      status: 'market_open',
      data,
    }
    
    // Cache the result
    cache.set(cacheKey, result, INTRADAY_TTL_MS)
    
    return result
  })
}

/**
 * Clear all intraday data (for cron job cleanup)
 * Returns the number of entries deleted
 */
export function clearIntradayCache(): number {
  return cache.clearIntraday()
}

// ============================================
// Export cache for external management
// ============================================

export { cache as cacheManager }