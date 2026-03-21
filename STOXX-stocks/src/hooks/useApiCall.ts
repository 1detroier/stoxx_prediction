// ============================================
// useApiCall Hook with Retry Logic
// ============================================

'use client'

import { useState, useCallback, useRef } from 'react'

interface UseApiCallOptions<T> {
  /** Maximum number of retry attempts */
  maxRetries?: number
  /** Delay between retries in milliseconds */
  retryDelay?: number
  /** Function to call on successful completion */
  onSuccess?: (data: T) => void
  /** Function to call on error */
  onError?: (error: Error) => void
}

interface UseApiCallReturn<T> {
  /** Current data */
  data: T | null
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error: Error | null
  /** Number of attempts made */
  attempts: number
  /** Execute the API call */
  execute: () => Promise<T | null>
  /** Manual retry */
  retry: () => Promise<T | null>
  /** Reset state */
  reset: () => void
}

/**
 * Hook for API calls with automatic retry logic
 * 
 * Features:
 * - Exponential backoff retry
 * - Configurable max retries
 * - Loading and error states
 * - Manual retry capability
 */
export function useApiCall<T>(
  apiCall: () => Promise<T>,
  options: UseApiCallOptions<T> = {}
): UseApiCallReturn<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onSuccess,
    onError,
  } = options

  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [attempts, setAttempts] = useState(0)

  const abortControllerRef = useRef<AbortController | null>(null)

  const execute = useCallback(async (): Promise<T | null> => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)
    setAttempts((prev) => prev + 1)

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall()
        
        setData(result)
        setIsLoading(false)
        setError(null)
        
        if (onSuccess) {
          onSuccess(result)
        }
        
        return result
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error')
        
        // If this is the last attempt, don't wait
        if (attempt < maxRetries) {
          // Exponential backoff: delay * 2^(attempt-1)
          const delay = retryDelay * Math.pow(2, attempt - 1)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // All retries failed
    setData(null)
    setError(lastError)
    setIsLoading(false)

    if (onError && lastError) {
      onError(lastError)
    }

    return null
  }, [apiCall, maxRetries, retryDelay, onSuccess, onError])

  const retry = useCallback(async (): Promise<T | null> => {
    setAttempts(0)
    return execute()
  }, [execute])

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setData(null)
    setError(null)
    setIsLoading(false)
    setAttempts(0)
  }, [])

  return {
    data,
    isLoading,
    error,
    attempts,
    execute,
    retry,
    reset,
  }
}

/**
 * Simple retry wrapper for one-off API calls
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000 } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      const delay = retryDelay * Math.pow(2, attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Retry logic error')
}
