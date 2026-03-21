'use client'

import React, { useMemo } from 'react'

interface SharpeRatioProps {
  returns: number[]
}

export function SharpeRatio({ returns }: SharpeRatioProps) {
  const { sharpeRatio, annualizedReturn, volatility } = useMemo(() => {
    if (returns.length < 2) {
      return { sharpeRatio: 0, annualizedReturn: 0, volatility: 0 }
    }

    // Calculate mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length

    // Calculate standard deviation (volatility)
    const squaredDiffs = returns.map((r) => Math.pow(r - meanReturn, 2))
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length
    const stdDev = Math.sqrt(variance)

    // Annualize assuming 252 trading days
    const tradingDays = 252
    const annualizedVol = stdDev * Math.sqrt(tradingDays)

    // Risk-free rate (simplified to 0 for now)
    const riskFreeRate = 0

    // Calculate Sharpe Ratio
    // Sharpe = (Mean Return - Risk-Free Rate) / Standard Deviation
    // Annualized: multiply mean return by sqrt(252)
    const annualizedMeanReturn = meanReturn * tradingDays
    const sharpe = annualizedVol > 0 
      ? (annualizedMeanReturn - riskFreeRate) / annualizedVol 
      : 0

    return {
      sharpeRatio: sharpe,
      annualizedReturn: annualizedMeanReturn,
      volatility: annualizedVol,
    }
  }, [returns])

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`
  const formatRatio = (value: number) => value.toFixed(2)

  const getSharpeColor = () => {
    if (sharpeRatio >= 1) return 'text-accent-success'
    if (sharpeRatio >= 0) return 'text-text-primary'
    return 'text-accent-danger'
  }

  return (
    <div className="space-y-3" role="region" aria-label="Risk metrics">
      <h4 className="text-sm font-medium text-text-secondary">Risk Metrics</h4>

      {/* Sharpe Ratio */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary" id="sharpe-label">Sharpe Ratio</span>
        <span 
          className={`text-sm font-semibold ${getSharpeColor()}`}
          aria-labelledby="sharpe-label"
        >
          {formatRatio(sharpeRatio)}
        </span>
      </div>

      {/* Annualized Return */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary" id="return-label">Annualized Return</span>
        <span 
          className={`text-sm font-semibold ${annualizedReturn >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}
          aria-labelledby="return-label"
        >
          {formatPercent(annualizedReturn)}
        </span>
      </div>

      {/* Volatility */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary" id="volatility-label">Volatility (Annualized)</span>
        <span 
          className="text-sm font-semibold text-text-primary"
          aria-labelledby="volatility-label"
        >
          {formatPercent(volatility)}
        </span>
      </div>

      {/* Note */}
      <p className="text-xs text-text-muted mt-2">
        Risk-free rate assumed to be 0% for simplicity.
      </p>
    </div>
  )
}

export default SharpeRatio
