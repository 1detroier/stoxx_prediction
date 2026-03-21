'use client'

import React from 'react'
import { Alert } from '@/components/ui'

interface AccuracyMetricsProps {
  metrics: {
    overall: number // 0-1 range
    healthy: number // 0-1 range
    distressed: number // 0-1 range
  }
}

export function AccuracyMetrics({ metrics }: AccuracyMetricsProps) {
  const formatPercentage = (value: number) => `${Math.round(value * 100)}%`

  const isDistressedAlert = metrics.distressed < 0.55

  return (
    <div className="space-y-3" role="region" aria-label="Model accuracy metrics">
      <h4 className="text-sm font-medium text-text-secondary">Model Accuracy</h4>

      {/* Overall Accuracy */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-primary" id="overall-label">Overall</span>
          <span 
            className="font-semibold text-text-primary"
            aria-labelledby="overall-label"
          >
            {formatPercentage(metrics.overall)}
          </span>
        </div>
        <div 
          className="w-full bg-background-tertiary rounded-full h-2"
          role="progressbar"
          aria-valuenow={Math.round(metrics.overall * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="overall-label"
        >
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: formatPercentage(metrics.overall) }}
          />
        </div>
      </div>

      {/* Healthy Accuracy */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-primary" id="healthy-label">Healthy Stocks</span>
          <span 
            className="font-semibold text-text-primary"
            aria-labelledby="healthy-label"
          >
            {formatPercentage(metrics.healthy)}
          </span>
        </div>
        <div 
          className="w-full bg-background-tertiary rounded-full h-2"
          role="progressbar"
          aria-valuenow={Math.round(metrics.healthy * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="healthy-label"
        >
          <div
            className="h-full bg-accent-success rounded-full"
            style={{ width: formatPercentage(metrics.healthy) }}
          />
        </div>
      </div>

      {/* Distressed Accuracy */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-primary" id="distressed-label">Distressed Stocks</span>
          <span 
            className="font-semibold text-accent-danger"
            aria-labelledby="distressed-label"
          >
            {formatPercentage(metrics.distressed)}
          </span>
        </div>
        <div 
          className="w-full bg-background-tertiary rounded-full h-2"
          role="progressbar"
          aria-valuenow={Math.round(metrics.distressed * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="distressed-label"
        >
          <div
            className="h-full bg-accent-danger rounded-full"
            style={{ width: formatPercentage(metrics.distressed) }}
          />
        </div>
      </div>

      {/* Alert if distressed accuracy is low */}
      {isDistressedAlert && (
        <Alert variant="warning" className="mt-2">
          <strong>Low accuracy for distressed stocks.</strong> Predictions for distressed
          companies may be less reliable. Consider this when making investment decisions.
        </Alert>
      )}
    </div>
  )
}

export default AccuracyMetrics
