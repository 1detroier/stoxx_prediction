// ============================================
// In-memory rate limiter for API routes
// ============================================
//
// Simple sliding-window rate limiter that works on single-instance Vercel.
// Uses an in-memory Map — good for low-traffic apps.
// For high-traffic production, swap for @upstash/ratelimit + Redis.
//
// Limits per IP address.

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Sliding window: 60 requests per minute per IP
const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 60

// Global store (survives across requests in same instance)
const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes to prevent memory leak
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  const expired: string[] = []
  store.forEach((entry, ip) => {
    if (now > entry.resetAt + WINDOW_MS) expired.push(ip)
  })
  expired.forEach(ip => store.delete(ip))
}

/**
 * Check and update rate limit for an IP.
 * Returns { allowed, remaining, resetIn }.
 * Throws nothing — call sites decide how to respond.
 */
export function checkRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetIn: number
} {
  cleanup()

  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    // New or expired window
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: WINDOW_MS }
  }

  if (entry.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.max(0, entry.resetAt - now),
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetIn: Math.max(0, entry.resetAt - now),
  }
}
