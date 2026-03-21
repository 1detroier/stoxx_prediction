'use client'

import React, { useState, useEffect } from 'react'
import type { Price, ModelPrediction } from '@/types'
import { DirectionIndicator } from './DirectionIndicator'
import { ConfidenceMeter } from './ConfidenceMeter'
import { AccuracyMetrics } from './AccuracyMetrics'
import { Card, LoadingSpinner, Alert } from '@/components/ui'
import { usePrediction } from '@/hooks'

interface PredictionPanelProps {
  ticker: string
  prices: Price[] | null
  modelVersion?: string
}

export function PredictionPanel({ ticker, prices, modelVersion }: PredictionPanelProps) {
  const {
    prediction,
    isLoading,
    isModelLoading,
    error,
    retryPrediction,
  } = usePrediction(ticker, prices, { autoFetchPrices: false })

  // Mock data for demonstration - in production this would come from ML model
  const mockMetrics = {
    overall: 0.72,
    healthy: 0.78,
    distressed: 0.61,
  }

  // Show loading state while model loads
  if (isLoading || isModelLoading) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary text-sm">
            {isModelLoading ? 'Loading ML model...' : 'Running prediction...'}
          </p>
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
          onClick={retryPrediction}
          className="mt-4 btn btn-secondary w-full"
        >
          Retry Prediction
        </button>
      </Card>
    )
  }

  if (!prediction) {
    return (
      <Card>
        <Alert variant="info">
          No prediction available for {ticker}
        </Alert>
      </Card>
    )
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Price Prediction</h3>
          <span className="text-xs text-text-muted">
            Model: {prediction.modelVersion}
          </span>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Direction Indicator */}
        <div className="flex justify-center">
          <DirectionIndicator direction={prediction.direction} size="lg" />
        </div>

        {/* Confidence Meter */}
        <ConfidenceMeter confidence={prediction.confidence} size="lg" />

        {/* Prediction Summary */}
        <div className="text-center text-sm text-text-secondary">
          The model predicts the price will go{' '}
          <span className={`font-semibold ${
            prediction.direction === 'UP' 
              ? 'text-accent-success' 
              : prediction.direction === 'DOWN'
              ? 'text-accent-danger'
              : 'text-text-primary'
          }`}>
            {prediction.direction}
          </span>{' '}
          over the next 5 trading days.
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Model Metrics */}
        <AccuracyMetrics metrics={mockMetrics} />
      </div>
    </Card>
  )
}

export default PredictionPanel
