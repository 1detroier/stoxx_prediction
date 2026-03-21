// ============================================
// Prediction vs Reality Comparison Chart
// ============================================

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, LoadingSpinner, Alert } from '@/components/ui'
import type { Price, Prediction, PredictionsResponse } from '@/types'
import type { PredictionRealityData, ComparisonDataPoint } from '@/lib/ml'

interface PredictionRealityChartProps {
  ticker: string
  days?: number
}

/**
 * Fetches and processes data for prediction vs reality comparison
 */
async function fetchComparisonData(
  ticker: string,
  days: number
): Promise<PredictionRealityData> {
  // Fetch predictions
  const predictionsResponse = await fetch(
    `/api/predictions?ticker=${ticker}&days=${days}`
  )
  
  // Fetch prices for the same period
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const pricesResponse = await fetch(
    `/api/prices?ticker=${ticker}&start_date=${startDate.toISOString().split('T')[0]}&end_date=${endDate.toISOString().split('T')[0]}`
  )

  const predictionsData: PredictionsResponse = predictionsResponse.ok
    ? await predictionsResponse.json()
    : { ticker, predictions: [], count: 0 }

  const pricesData = pricesResponse.ok
    ? await pricesResponse.json()
    : { ticker, prices: [], count: 0 }

  const predictions: Prediction[] = predictionsData.predictions || []
  const prices: Price[] = pricesData.prices || []

  // Calculate cumulative returns from base price
  const sortedPrices = prices
    .filter(p => p.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (sortedPrices.length === 0) {
    return {
      ticker,
      dataPoints: [],
      accuracy: null,
      totalPredictions: 0,
      correctPredictions: 0,
    }
  }

  const basePrice = sortedPrices[0].close!
  
  // Build price map for quick lookup
  const priceMap = new Map<string, number>()
  sortedPrices.forEach(p => {
    priceMap.set(p.date, (p.close! - basePrice) / basePrice)
  })

  // Build data points for each prediction date
  const dataPoints: ComparisonDataPoint[] = []
  let correctCount = 0

  for (const pred of predictions) {
    const predictedDate = pred.predicted_at.split('T')[0]
    const actualDirection = pred.actual_direction
    const wasCorrect = pred.was_correct

    // Get predicted cumulative return (for now, show 0 as baseline)
    // In a full implementation, this would use model output
    const predicted = 0 // Placeholder - would be actual predicted cumulative return

    // Get actual cumulative return at prediction time
    const actual = priceMap.get(predictedDate) ?? null

    if (actual !== null) {
      dataPoints.push({
        date: predictedDate,
        predicted,
        actual,
        isCorrect: wasCorrect,
      })

      if (wasCorrect) {
        correctCount++
      }
    }
  }

  const totalPredictions = predictions.length

  return {
    ticker,
    dataPoints,
    accuracy: totalPredictions > 0 ? correctCount / totalPredictions : null,
    totalPredictions,
    correctPredictions: correctCount,
  }
}

export function PredictionRealityChart({ ticker, days = 30 }: PredictionRealityChartProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PredictionRealityData | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const comparisonData = await fetchComparisonData(ticker, days)
      setData(comparisonData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison data')
    } finally {
      setIsLoading(false)
    }
  }, [ticker, days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Render chart using simple SVG (lightweight alternative to TradingView)
  const renderChart = useMemo(() => {
    if (!data || data.dataPoints.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-text-secondary">
          No prediction data available for the selected period
        </div>
      )
    }

    const { dataPoints } = data
    const width = 600
    const height = 300
    const padding = { top: 20, right: 20, bottom: 40, left: 60 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Calculate scales
    const allValues = dataPoints.flatMap(d => [d.predicted ?? 0, d.actual ?? 0].filter(v => v !== null)) as number[]
    const minVal = Math.min(...allValues, 0)
    const maxVal = Math.max(...allValues, 0.01)
    const range = maxVal - minVal || 0.01

    const xScale = (index: number) => padding.left + (index / (dataPoints.length - 1 || 1)) * chartWidth
    const yScale = (value: number) => padding.top + chartHeight - ((value - minVal) / range) * chartHeight

    // Generate path for actual values
    const actualPath = dataPoints
      .map((d, i) => {
        if (d.actual === null) return null
        return `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.actual)}`
      })
      .filter(Boolean)
      .join(' ')

    // Generate path for predicted values
    const predictedPath = dataPoints
      .map((d, i) => {
        if (d.predicted === null) return null
        return `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.predicted)}`
      })
      .filter(Boolean)
      .join(' ')

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{ maxHeight: '300px' }}
      >
        {/* Background */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="var(--color-background)"
          stroke="var(--color-border)"
          strokeWidth="1"
        />

        {/* Zero line */}
        <line
          x1={padding.left}
          y1={yScale(0)}
          x2={padding.left + chartWidth}
          y2={yScale(0)}
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="4,4"
        />

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * chartHeight
          const value = maxVal - ratio * range
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="0.5"
                strokeOpacity="0.3"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-text-muted"
                style={{ fontSize: '10px' }}
              >
                {(value * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {dataPoints
          .filter((_, i) => i % Math.ceil(dataPoints.length / 5) === 0)
          .map((d, i) => {
            const originalIndex = dataPoints.indexOf(d)
            return (
              <text
                key={i}
                x={xScale(originalIndex)}
                y={height - 10}
                textAnchor="middle"
                className="fill-text-muted"
                style={{ fontSize: '10px' }}
              >
                {d.date.slice(5)}
              </text>
            )
          })}

        {/* Actual line */}
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Predicted line (dashed) */}
        {predictedPath && (
          <path
            d={predictedPath}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeDasharray="4,4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Prediction points with color coding */}
        {dataPoints.map((d, i) => {
          if (d.actual === null) return null
          return (
            <circle
              key={i}
              cx={xScale(i)}
              cy={yScale(d.actual)}
              r="4"
              fill={
                d.isCorrect === true
                  ? '#10b981'
                  : d.isCorrect === false
                  ? '#ef4444'
                  : '#6b7280'
              }
            />
          )
        })}

        {/* Legend */}
        <g transform={`translate(${padding.left}, ${height - 25})`}>
          <rect x="0" y="0" width="12" height="12" fill="#10b981" rx="2" />
          <text x="18" y="10" className="fill-text-secondary" style={{ fontSize: '11px' }}>
            Actual
          </text>
          
          <line x1="70" y1="6" x2="82" y2="6" stroke="#6366f1" strokeWidth="2" strokeDasharray="4,4" />
          <text x="90" y="10" className="fill-text-secondary" style={{ fontSize: '11px' }}>
            Predicted
          </text>
          
          <circle cx="160" cy="6" r="4" fill="#10b981" />
          <text x="170" y="10" className="fill-text-secondary" style={{ fontSize: '11px' }}>
            Correct
          </text>
          
          <circle cx="230" cy="6" r="4" fill="#ef4444" />
          <text x="240" y="10" className="fill-text-secondary" style={{ fontSize: '11px' }}>
            Incorrect
          </text>
        </g>
      </svg>
    )
  }, [data])

  if (isLoading) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary text-sm">Loading comparison data...</p>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <Alert variant="error">
          {error}
        </Alert>
        <button
          onClick={fetchData}
          className="mt-4 btn btn-secondary"
        >
          Retry
        </button>
      </Card>
    )
  }

  if (!data || data.dataPoints.length === 0) {
    return (
      <Card>
        <div className="text-center py-8 text-text-secondary">
          <p>No historical predictions available for comparison.</p>
          <p className="text-sm mt-2">
            Predictions are recorded daily and will appear here after sufficient data is collected.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Prediction vs Reality</h3>
          <div className="flex items-center gap-4 text-sm">
            {data.accuracy !== null && (
              <span className="text-text-secondary">
                Accuracy:{' '}
                <span className={data.accuracy >= 0.5 ? 'text-accent-success' : 'text-accent-danger'}>
                  {(data.accuracy * 100).toFixed(1)}%
                </span>
              </span>
            )}
            <span className="text-text-muted">
              {data.totalPredictions} predictions
            </span>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Comparison of predicted price movements vs actual outcomes over the last {days} days.
        </p>
        {renderChart}
      </div>
    </Card>
  )
}

export default PredictionRealityChart
