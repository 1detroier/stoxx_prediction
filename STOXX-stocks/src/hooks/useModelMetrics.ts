// ============================================
// useModelMetrics Hook
// ============================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Cache for metrics with TTL
interface CachedMetrics {
  metrics: ModelMetrics
  timestamp: number
}

const metricsCache = new Map<string, CachedMetrics>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const API_ENDPOINT = '/api/models/latest'

export interface ModelMetrics {
  overall: number // 0-1 range (API: training_accuracy)
  healthy: number // 0-1 range (calculated)
  distressed: number // 0-1 range (API: distressed_accuracy)
}

export interface UseModelMetricsResult {
  metrics: ModelMetrics | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Hook for fetching model accuracy metrics from the backend
 * 
 * Features:
 * - Fetches from /api/models/latest endpoint
 * - In-memory cache with 5-minute TTL
 * - Calculates healthy accuracy from API values
 * - Handles errors gracefully with fallback to null
 * - AbortController for cleanup on unmount
 */
export function useModelMetrics(): UseModelMetricsResult {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchMetrics = useCallback(async (forceRefresh = false) => {
    const cacheKey = 'metrics:latest'
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = metricsCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setMetrics(cached.metrics)
        setIsLoading(false)
        setError(null)
        return
      }
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new AbortController
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(API_ENDPOINT, { signal })
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }
      
      const data = await response.json()

      // Extract and validate required fields
      const trainingAccuracy = data.training_accuracy
      const distressedAccuracy = data.distressed_accuracy

      if (trainingAccuracy === undefined || trainingAccuracy === null) {
        throw new Error('Missing training_accuracy in response')
      }

      if (distressedAccuracy === undefined || distressedAccuracy === null) {
        throw new Error('Missing distressed_accuracy in response')
      }

      // Calculate healthy accuracy: healthy = 1 - (1 - overall) * (distressed / overall)
      const overall = trainingAccuracy
      const distressed = distressedAccuracy
      const healthy = overall > 0 ? 1 - (1 - overall) * (distressed / overall) : 0

      const result: ModelMetrics = {
        overall,
        healthy,
        distressed,
      }

      // Cache the result
      metricsCache.set(cacheKey, {
        metrics: result,
        timestamp: Date.now(),
      })

      setMetrics(result)
      setError(null)
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch metrics'
      setError(errorMessage)
      
      // Try to use cached data even if stale (fallback behavior)
      const cached = metricsCache.get(cacheKey)
      if (cached) {
        setMetrics(cached.metrics)
      } else {
        setMetrics(null)
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    fetchMetrics(false)

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchMetrics])

  // Refetch function (clears cache and fetches fresh)
  const refetch = useCallback(() => {
    fetchMetrics(true)
  }, [fetchMetrics])

  return {
    metrics,
    isLoading,
    error,
    refetch,
  }
}

export default useModelMetrics