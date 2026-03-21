'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Company, Price, FinnhubQuote, PricesResponse } from '@/types'
import { PriceChartContainer, PredictionRealityChart } from '@/components/charts'
import { PredictionPanel } from '@/components/predictions'
import { RiskMetrics } from '@/components/metrics'
import { Card, LoadingSpinner, Alert, Skeleton, ErrorBoundary } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { useApiCall } from '@/hooks'

function StockHeader({ 
  company, 
  quote 
}: { 
  company: Company
  quote: FinnhubQuote | null 
}) {
  const priceChange = quote?.change_percent ?? 0
  const isPositive = priceChange >= 0

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-text-primary">
            {company.ticker}
          </h1>
          {company.is_distressed && (
            <span className="badge badge-danger text-sm" role="status">
              ⚠️ Distressed
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xl text-text-primary">
              €{quote?.price?.toFixed(2) || '—'}
            </p>
            {quote && (
              <p className={`text-sm ${isPositive ? 'text-accent-success' : 'text-accent-danger'}`}>
                {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="text-text-secondary mt-2">{company.name}</p>
      <div className="flex flex-wrap gap-2 mt-2" role="list" aria-label="Company tags">
        <span className="badge badge-neutral" role="listitem">{company.exchange}</span>
        <span className="badge badge-neutral" role="listitem">{company.sector}</span>
        <span className="badge badge-neutral" role="listitem">{company.country}</span>
      </div>
    </div>
  )
}

function StockLoadingSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Skeleton className="w-24 h-8" />
      </div>

      <div className="mb-8">
        <Skeleton className="w-64 h-10 mb-2" />
        <Skeleton className="w-96 h-6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Skeleton className="h-96" />
        </div>
        <div>
          <Skeleton className="h-80" />
        </div>
      </div>

      <div className="mt-6">
        <Skeleton className="h-64" />
      </div>

      <div className="mt-6">
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

interface StockData {
  company: Company
  prices: Price[]
  quote: FinnhubQuote | null
}

export default function StockDetailPage() {
  const params = useParams()
  const ticker = params.ticker as string
  const { showToast } = useToast()

  const fetchStockData = useCallback(async (): Promise<StockData> => {
    // Fetch company data
    const companyResponse = await fetch(`/api/companies?search=${ticker}`)
    if (!companyResponse.ok) {
      throw new Error('Failed to fetch company data')
    }
    const companyData = await companyResponse.json()
    
    // Find exact match
    const foundCompany = companyData.companies.find(
      (c: Company) => c.ticker.toUpperCase() === ticker.toUpperCase()
    )
    
    if (!foundCompany) {
      throw new Error(`Company ${ticker} not found`)
    }

    // Fetch price data
    const pricesResponse = await fetch(`/api/prices?ticker=${ticker}&limit=365`)
    const pricesData: PricesResponse = pricesResponse.ok
      ? await pricesResponse.json()
      : { ticker, prices: [], count: 0 }

    // Fetch live quote
    let quote: FinnhubQuote | null = null
    try {
      const quoteResponse = await fetch(`/api/finnhub/quote?symbol=${ticker}`)
      if (quoteResponse.ok) {
        quote = await quoteResponse.json()
      }
    } catch {
      // Quote is optional
    }

    return {
      company: foundCompany,
      prices: pricesData.prices || [],
      quote,
    }
  }, [ticker])

  const { data, isLoading, error, execute, retry } = useApiCall(fetchStockData, {
    maxRetries: 3,
    retryDelay: 1000,
    onSuccess: () => {
      showToast('Stock data loaded', 'success')
    },
    onError: (err) => {
      showToast(`Failed to load stock: ${err.message}`, 'error', 8000)
    },
  })

  useEffect(() => {
    execute()
  }, [execute])

  if (isLoading || !data) {
    return (
      <main className="min-h-screen bg-background">
        <StockLoadingSkeleton />
      </main>
    )
  }

  if (error || !data.company) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-accent hover:text-accent-hover mb-6 transition-colors"
            aria-label="Go back to dashboard"
          >
            ← Back to Dashboard
          </Link>
          <Alert variant="error">
            <div className="flex flex-col gap-2">
              <span>{error?.message || 'Failed to load stock data'}</span>
              <button
                onClick={retry}
                className="text-sm underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </Alert>
        </div>
      </main>
    )
  }

  const { company, prices, quote } = data
  const priceChange = quote?.change_percent ?? 0
  const isPositive = priceChange >= 0

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-accent hover:text-accent-hover mb-6 transition-colors touch-target"
          aria-label="Go back to dashboard"
        >
          ← Back to Dashboard
        </Link>

        <ErrorBoundary title="Unable to load stock details">
          {/* Stock Header */}
          <StockHeader company={company} quote={quote} />

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Price Chart - Takes 2 columns */}
            <div className="lg:col-span-2">
              <Card padding="md">
                <PriceChartContainer ticker={company.ticker} />
              </Card>
            </div>

            {/* Prediction Panel - Takes 1 column */}
            <div>
              <ErrorBoundary title="Prediction unavailable">
                <PredictionPanel 
                  ticker={company.ticker} 
                  prices={prices.length > 0 ? prices : null}
                />
              </ErrorBoundary>
            </div>
          </div>

          {/* Prediction vs Reality Chart */}
          <div className="mt-6">
            <ErrorBoundary title="Chart unavailable">
              <PredictionRealityChart ticker={company.ticker} days={30} />
            </ErrorBoundary>
          </div>

          {/* Risk Metrics */}
          <div className="mt-6">
            <ErrorBoundary title="Metrics unavailable">
              <RiskMetrics ticker={company.ticker} prices={prices} />
            </ErrorBoundary>
          </div>

          {/* Additional Info */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card
              header={
                <h3 className="font-semibold text-text-primary">Company Information</h3>
              }
            >
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ticker</span>
                  <span className="text-text-primary font-medium">{company.ticker}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Exchange</span>
                  <span className="text-text-primary">{company.exchange}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Sector</span>
                  <span className="text-text-primary">{company.sector}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Country</span>
                  <span className="text-text-primary">{company.country}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Status</span>
                  <span className={company.is_distressed ? 'text-accent-danger' : 'text-accent-success'}>
                    {company.is_distressed ? 'Distressed' : 'Healthy'}
                  </span>
                </div>
              </div>
            </Card>

            <Card
              header={
                <h3 className="font-semibold text-text-primary">Live Quote</h3>
              }
            >
              {quote ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Current Price</span>
                    <span className="text-text-primary font-medium">
                      €{quote.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Change</span>
                    <span className={isPositive ? 'text-accent-success' : 'text-accent-danger'}>
                      {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_percent.toFixed(2)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Open</span>
                    <span className="text-text-primary">€{quote.open?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">High</span>
                    <span className="text-text-primary">€{quote.high?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Low</span>
                    <span className="text-text-primary">€{quote.low?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Previous Close</span>
                    <span className="text-text-primary">€{quote.previous_close?.toFixed(2) || '—'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-text-secondary text-sm">
                  Live quote unavailable
                </p>
              )}
            </Card>
          </div>
        </ErrorBoundary>
      </div>
    </main>
  )
}
