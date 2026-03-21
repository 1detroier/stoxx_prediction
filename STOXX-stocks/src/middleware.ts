import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Security headers middleware.
 * Applies to all routes except Next.js internals and static assets.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Prevent clickjacking — blocks embedding in iframes
  response.headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Control referrer information sent to other sites
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Disable browser features the app doesn't use
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  )

  // XSS protection (legacy browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // Strict Transport Security (force HTTPS on supporting browsers)
  // Set max-age to 1 year for production safety
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )

  // Content Security Policy — tighten for production
  // Allow self + Vercel CDN assets
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co https://finnhub.io",
    "frame-ancestors 'none'",
  ]
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '))

  return response
}

export const config = {
  // Match all paths except Next.js internals and static files
  matcher: [
    '/((?!_next/image|_next/static|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf)).*)',
  ],
}
