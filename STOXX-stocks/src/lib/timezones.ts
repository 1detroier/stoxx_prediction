// ============================================
// Timezone Utilities for Stock Tickers
// ============================================
//
// Provides timezone mapping based on ticker suffixes and
// timezone-aware period1 calculation for intraday data.

import { toZonedTime, format } from 'date-fns-tz'

// Mapping of ticker suffixes to IANA timezones
const TIMEZONE_MAP: Record<string, string> = {
  '.SW': 'Europe/Zurich',    // Swiss Exchange
  '.DE': 'Europe/Berlin',     // Xetra/Frankfurt
  '.PA': 'Europe/Paris',      // Euronext Paris
  '.L':  'Europe/London',     // LSE
  '.TO': 'America/Toronto',   // Toronto
  '.VI': 'Europe/Vienna',    // Vienna
  '.OL': 'Europe/Oslo',       // Oslo
  '.HE': 'Europe/Helsinki',  // Helsinki
  '.AX': 'Australia/Sydney',  // Australia
  '.NZ': 'Pacific/Auckland', // New Zealand
}

// Default timezone for US stocks
const DEFAULT_TIMEZONE = 'America/New_York'

// Market opening hours by timezone type
interface MarketHours {
  openHour: number
  openMinute: number
}

// US markets open at 09:30 ET
const US_MARKET_HOURS: MarketHours = {
  openHour: 9,
  openMinute: 30,
}

// European markets open at 09:00 local time
const EU_MARKET_HOURS: MarketHours = {
  openHour: 9,
  openMinute: 0,
}

// Australian markets open at 10:00 AEST
const AU_MARKET_HOURS: MarketHours = {
  openHour: 10,
  openMinute: 0,
}

/**
 * Get the IANA timezone for a given ticker based on its suffix.
 * 
 * @param ticker - Stock ticker symbol (e.g., "AAPL", "ABBN.SW", "SAP.DE")
 * @returns IANA timezone string (e.g., "Europe/Zurich", "America/New_York")
 * 
 * @example
 * getTimezoneForTicker("ABBN.SW") // "Europe/Zurich"
 * getTimezoneForTicker("SAP.DE")   // "Europe/Berlin"
 * getTimezoneForTicker("AAPL")     // "America/New_York"
 */
export function getTimezoneForTicker(ticker: string): string {
  if (!ticker || typeof ticker !== 'string') {
    return DEFAULT_TIMEZONE
  }

  const normalized = ticker.toUpperCase().trim()
  const lastDotIndex = normalized.lastIndexOf('.')

  // No suffix - treat as US ticker
  if (lastDotIndex === -1) {
    return DEFAULT_TIMEZONE
  }

  const suffix = normalized.slice(lastDotIndex)
  return TIMEZONE_MAP[suffix] ?? DEFAULT_TIMEZONE
}

/**
 * Determine market opening hours based on timezone.
 * 
 * @param timezone - IANA timezone string
 * @returns MarketHours object with openHour and openMinute
 */
function getMarketHours(timezone: string): MarketHours {
  // US markets
  if (timezone === 'America/New_York' || timezone === 'America/Toronto') {
    return US_MARKET_HOURS
  }

  // Australian markets
  if (timezone === 'Australia/Sydney' || timezone === 'Pacific/Auckland') {
    return AU_MARKET_HOURS
  }

  // European markets (default for EU timezones)
  return EU_MARKET_HOURS
}

/**
 * Calculate the period1 Date for intraday data based on timezone.
 * Returns a Date object representing market open time in the target timezone.
 * 
 * @param timezone - IANA timezone string (e.g., "Europe/Zurich", "America/New_York")
 * @param daysAgo - Number of days to go back for data (default: 0 = today)
 * @returns Date object representing market open time
 * 
 * @example
 * calculateIntradayPeriod1("Europe/Zurich") // Date for today 09:00 Zurich time
 * calculateIntradayPeriod1("America/New_York") // Date for today 09:30 ET
 */
export function calculateIntradayPeriod1(timezone: string, daysAgo: number = 0): Date {
  const now = new Date()
  
  // Get the target timezone
  const targetTimezone = timezone ?? DEFAULT_TIMEZONE
  
  // Convert current time to the target timezone
  const zonedDate = toZonedTime(now, targetTimezone)
  
  // Get market opening hours for this timezone
  const marketHours = getMarketHours(targetTimezone)
  
  // Calculate the date, adjusting for daysAgo if needed
  let year = zonedDate.getFullYear()
  let month = zonedDate.getMonth()
  let day = zonedDate.getDate() - daysAgo

  // Handle month boundary when going back days
  while (day < 1) {
    month--
    if (month < 0) {
      month = 11
      year--
    }
    const daysInPrevMonth = new Date(year, month + 1, 0).getDate()
    day += daysInPrevMonth
  }

  // Create a date in the target timezone at market open time
  // Note: This creates the date in local time, then we'll use it with toZonedTime
  const openDate = new Date(Date.UTC(
    year,
    month,
    day,
    marketHours.openHour,
    marketHours.openMinute,
    0
  ))

  return openDate
}

/**
 * Format a date for yfinance API (accepts Date or string).
 * Returns ISO string format required by yfinance.
 * 
 * @param date - Date object or ISO date string
 * @returns Formatted date string for yfinance
 */
export function formatForYfinance(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: 'UTC' })
}

/**
 * Get market status based on timezone.
 * Returns whether the market is likely open based on current time in that timezone.
 * 
 * @param timezone - IANA timezone string
 * @returns true if market is likely open, false otherwise
 */
export function isMarketOpenInTimezone(timezone: string): boolean {
  const zonedDate = toZonedTime(new Date(), timezone)
  const marketHours = getMarketHours(timezone)
  
  const hours = zonedDate.getHours()
  const minutes = zonedDate.getMinutes()
  const currentMinutes = hours * 60 + minutes
  
  const openMinutes = marketHours.openHour * 60 + marketHours.openMinute
  // Assume market closes 7.5 hours after open (e.g., 16:30 for US, 17:30 for EU)
  const closeMinutes = openMinutes + (7.5 * 60)
  
  const dayOfWeek = zonedDate.getDay()
  
  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false
  }
  
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}
