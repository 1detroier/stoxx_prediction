'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import dynamic from 'next/dynamic'
import type { TimeResolution, Price, PricesResponse } from '@/types'
import { ResolutionSwitcher } from './ResolutionSwitcher'
import { LoadingSpinner, Alert } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

// Dynamic import to avoid SSR issues with TradingView charts
const PriceChart = dynamic(
  () => import('./PriceChart').then((mod) => mod.PriceChart),
  { 
    ssr: false, 
    loading: () => (
      <div className="h-[400px] flex items-center justify-center" aria-label="Loading chart">
        <LoadingSpinner size="lg" />
      </div>
    )
  }
)

interface PriceChartContainerProps {
  ticker: string
  initialResolution?: TimeResolution
}

export function PriceChartContainer({ ticker, initialResolution = '1m' }: PriceChartContainerProps) {
  const [resolution, setResolution] = useState<TimeResolution>(initialResolution)
  const [prices, setPrices] = useState<Price[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  const fetchPrices = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // For intraday, use Finnhub API
      if (resolution === 'intraday') {
        const response = await fetch(`/api/finnhub/quote?symbol=${encodeURIComponent(ticker)}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch intraday data')
        }

        const data = await response.json()
        
        // Transform Finnhub quote to chart format
        // Finnhub returns current quote, we'll create a single candle for today
        const today = new Date().toISOString().split('T')[0]
        const quote: Price[] = [{
          ticker,
          date: today,
          open: data.open || data.previous_close,
          high: data.high,
          low: data.low,
          close: data.price,
          adjusted_close: data.price,
          volume: null,
        }]
        
        setPrices(quote)
        return
      }

      // Calculate date range based on resolution for daily data
      const endDate = new Date()
      const startDate = new Date()
      
      switch (resolution) {
        case '5d':
          startDate.setDate(endDate.getDate() - 5)
          break
        case '1m':
          startDate.setMonth(endDate.getMonth() - 1)
          break
        case '6m':
          startDate.setMonth(endDate.getMonth() - 6)
          break
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1)
          break
        case '5y':
          startDate.setFullYear(endDate.getFullYear() - 5)
          break
      }

      const params = new URLSearchParams({
        ticker,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      })

      const response = await fetch(`/api/prices?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch price data')
      }

      const data: PricesResponse = await response.json()
      setPrices(data.prices)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load prices'
      setError(message)
      showToast(message, 'error')
    } finally {
      setIsLoading(false)
    }
  }, [ticker, resolution, showToast])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  // Transform prices to chart format
  const chartData = prices
    .filter((p) => p.close !== null)
    .map((p) => ({
      time: p.date,
      open: p.open ?? p.close ?? 0,
      high: p.high ?? p.close ?? 0,
      low: p.low ?? p.close ?? 0,
      close: p.close ?? 0,
    }))
    .sort((a, b) => a.time.localeCompare(b.time))

  const handleRetry = useCallback(() => {
    fetchPrices()
  }, [fetchPrices])

  return (
    <div className="space-y-4" role="region" aria-label={`${ticker} price chart`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <ResolutionSwitcher
          activeResolution={resolution}
          onChange={setResolution}
        />
        <span className="text-xs text-text-muted">
          {prices.length} data points
        </span>
      </div>

      {error ? (
        <div className="chart-container">
          <Alert variant="error">
            <div className="flex flex-col gap-2">
              <span>{error}</span>
              <button
                onClick={handleRetry}
                className="text-sm underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </Alert>
        </div>
      ) : isLoading ? (
        <div className="chart-container h-[400px] flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="chart-container h-[400px] flex flex-col items-center justify-center gap-4">
          <p className="text-text-secondary">No price data available for this period</p>
          <button
            onClick={handleRetry}
            className="btn btn-secondary"
          >
            Try Again
          </button>
        </div>
      ) : (
        <Suspense fallback={
          <div className="chart-container h-[400px] flex items-center justify-center">
            <LoadingSpinner size="lg" />
          </div>
        }>
          <PriceChart 
            id="price-chart"
            data={chartData} 
            ticker={ticker} 
          />
        </Suspense>
      )}
    </div>
  )
}

export default PriceChartContainer
