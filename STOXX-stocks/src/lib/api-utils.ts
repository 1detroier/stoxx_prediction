// ============================================
// API Utilities — Shared helpers for API routes
// ============================================

import { NextResponse } from 'next/server'

/**
 * Build a sanitized 500 error response.
 * Shows error details only in development, generic message in production.
 * Prevents internal details (DB paths, query structure, stack traces) from
 * leaking to clients in production.
 */
export function serverError(error: unknown): NextResponse {
  const isDev = process.env.NODE_ENV === 'development'

  console.error('[API Error]', isDev ? error : (error instanceof Error ? error.message : 'Unknown'))

  return NextResponse.json(
    {
      error: 'Internal Server Error',
      message: isDev && error instanceof Error
        ? error.message
        : 'An unexpected error occurred',
    },
    { status: 500 }
  )
}

/**
 * Escape special characters in PostgreSQL ILIKE/LIKE search terms.
 * Prevents % and _ wildcards from being injected by users.
 * PostgreSQL treats % as "any chars" and _ as "any single char" in LIKE patterns.
 */
export function escapeSearchTerm(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
