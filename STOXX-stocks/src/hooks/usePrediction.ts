// ============================================
// usePrediction Hook
// ============================================

'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Price, ModelPrediction } from '@/types'
import { modelService, type PredictionResult } from '@/lib/ml'

interface UsePredictionOptions {
  /** Auto-fetch prices if not provided */
  autoFetchPrices?: boolean
  /** Number of days of historical prices to fetch */
  priceDays?: number
}

interface UsePredictionResult {
  prediction: ModelPrediction | null
  isLoading: boolean
  isModelLoading: boolean
  error: string | null
  runPrediction: () => Promise<void>
  retryPrediction: () => Promise<void>
}

/**
 * Hook for running price predictions using TensorFlow.js
 * 
 * Features:
 * - Fetches model parameters automatically
 * - Extracts features from prices
 * - Runs inference via ModelService
 * - Memoizes predictions to prevent redundant computation
 */
export function usePrediction(
  ticker: string,
  prices: Price[] | null,
  options: UsePredictionOptions = {}
): UsePredictionResult {
  const { autoFetchPrices = false, priceDays = 365 } = options

  const [prediction, setPrediction] = useState<ModelPrediction | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedPrices, setFetchedPrices] = useState<Price[] | null>(null)

  const lastPredictionRef = useRef<{ ticker: string; pricesHash: number } | null>(null)

  // Hash function for prices to detect changes
  const hashPrices = useCallback((prices: Price[]): number => {
    if (prices.length === 0) return 0
    // Simple hash based on last few prices
    const relevant = prices.slice(-10)
    return relevant.reduce((acc, p) => {
      return acc + (p.close ?? 0) * 31 + new Date(p.date).getTime()
    }, 0)
  }, [])

  // Auto-fetch prices if enabled and not provided
  useEffect(() => {
    if (autoFetchPrices && !prices && !fetchedPrices) {
      const fetchPrices = async () => {
        try {
          const endDate = new Date()
          const startDate = new Date()
          startDate.setDate(startDate.getDate() - priceDays)

          const params = new URLSearchParams({
            ticker,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
          })

          const response = await fetch(`/api/prices?${params}`)
          if (response.ok) {
            const data = await response.json()
            setFetchedPrices(data.prices || [])
          }
        } catch (err) {
          console.error('Failed to fetch prices:', err)
        }
      }

      fetchPrices()
    }
  }, [autoFetchPrices, prices, fetchedPrices, ticker, priceDays])

  // Determine which prices to use
  const activePrices = prices || fetchedPrices

  /**
   * Run a prediction
   */
  const runPrediction = useCallback(async () => {
    if (!activePrices || activePrices.length === 0) {
      setError('No price data available')
      return
    }

    // Check if we already have a prediction for this state
    const pricesHash = hashPrices(activePrices)
    if (
      lastPredictionRef.current?.ticker === ticker &&
      lastPredictionRef.current?.pricesHash === pricesHash &&
      prediction
    ) {
      return // Already predicted for this state
    }

    setIsLoading(true)
    setError(null)

    try {
      // Load Z-score params if not loaded
      if (!modelService.getZScoreParams()) {
        setIsModelLoading(true)
        await modelService.loadZScoreParams()
        setIsModelLoading(false)
      }

      // Run prediction
      const result: PredictionResult = await modelService.predictFromPrices(activePrices)

      // Convert to ModelPrediction format
      const modelPrediction: ModelPrediction = {
        direction: result.direction,
        confidence: result.confidence,
        ticker,
        modelVersion: result.modelVersion,
        timestamp: result.timestamp,
      }

      setPrediction(modelPrediction)
      lastPredictionRef.current = { ticker, pricesHash }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed')
      setPrediction(null)
    } finally {
      setIsLoading(false)
      setIsModelLoading(false)
    }
  }, [activePrices, ticker, hashPrices, prediction])

  /**
   * Retry prediction after error
   */
  const retryPrediction = useCallback(async () => {
    lastPredictionRef.current = null // Clear cache
    await runPrediction()
  }, [runPrediction])

  // Auto-run prediction when prices change
  useEffect(() => {
    if (activePrices && activePrices.length > 0) {
      const pricesHash = hashPrices(activePrices)
      
      // Only auto-predict if prices actually changed
      if (
        lastPredictionRef.current?.ticker !== ticker ||
        lastPredictionRef.current?.pricesHash !== pricesHash
      ) {
        runPrediction()
      }
    }
  }, [activePrices, ticker, hashPrices, runPrediction])

  return {
    prediction,
    isLoading,
    isModelLoading,
    error,
    runPrediction,
    retryPrediction,
  }
}
