'use client'

import React, { useMemo } from 'react'
import type { Price } from '@/types'
import { SharpeRatio } from './SharpeRatio'
import { Card } from '@/components/ui'

interface RiskMetricsProps {
  ticker: string
  prices: Price[]
}

export function RiskMetrics({ ticker, prices }: RiskMetricsProps) {
  // Calculate daily returns from prices
  const returns = useMemo(() => {
    if (prices.length < 2) return []

    const sortedPrices = [...prices]
      .filter((p) => p.close !== null)
      .sort((a, b) => a.date.localeCompare(b.date))

    const dailyReturns: number[] = []

    for (let i = 1; i < sortedPrices.length; i++) {
      const prevClose = sortedPrices[i - 1].close
      const currentClose = sortedPrices[i].close

      if (prevClose && prevClose !== 0) {
        const dailyReturn = (currentClose! - prevClose) / prevClose
        dailyReturns.push(dailyReturn)
      }
    }

    return dailyReturns
  }, [prices])

  if (returns.length < 2) {
    return (
      <Card
        header={
          <h3 className="font-semibold text-text-primary">Risk Metrics</h3>
        }
      >
        <p className="text-text-secondary text-sm">
          Not enough price data to calculate risk metrics.
        </p>
      </Card>
    )
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Risk Metrics</h3>
          <span className="text-xs text-text-muted">
            Based on {returns.length} trading days
          </span>
        </div>
      }
    >
      <SharpeRatio returns={returns} />
    </Card>
  )
}

export default RiskMetrics
