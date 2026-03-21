'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { Company, CompaniesResponse } from '@/types'
import { CompanySelector } from '@/components/dashboard'
import { LoadingSpinner, Alert, ErrorBoundary } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { useApiCall } from '@/hooks'

export default function HomePage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const { showToast } = useToast()

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await fetch('/api/companies?limit=100')
      
      if (!response.ok) {
        throw new Error('Failed to fetch companies')
      }

      const data: CompaniesResponse = await response.json()
      setCompanies(data.companies)
      setTotalCount(data.total)
      return data
    } catch (err) {
      throw err instanceof Error ? err : new Error('Unknown error occurred')
    }
  }, [])

  const { data, isLoading, error, execute, retry, attempts } = useApiCall(fetchCompanies, {
    maxRetries: 3,
    retryDelay: 1000,
    onSuccess: () => {
      showToast('Companies loaded successfully', 'success')
    },
    onError: (err) => {
      showToast(`Failed to load companies: ${err.message}`, 'error')
    },
  })

  useEffect(() => {
    execute()
  }, [execute])

  // Update state when data changes
  useEffect(() => {
    if (data) {
      setCompanies(data.companies)
      setTotalCount(data.total)
    }
  }, [data])

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-secondary">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                📈 STOXX-stocks
              </h1>
              <p className="text-sm text-text-secondary">
                European stock prediction platform for STOXX 600 companies
              </p>
            </div>
            <div className="flex items-center gap-2">
              {attempts > 1 && (
                <span className="text-xs text-text-muted">
                  Attempt {attempts}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <ErrorBoundary title="Unable to display companies">
          {error && (
            <Alert 
              variant="error" 
              className="mb-6"
              onDismiss={() => showToast('Please try again', 'info')}
            >
              <div className="flex flex-col gap-2">
                <span>{error.message}</span>
                <button
                  onClick={retry}
                  className="text-sm underline hover:no-underline"
                  aria-label="Retry loading companies"
                >
                  Retry
                </button>
              </div>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <CompanySelector
              companies={companies}
              isLoading={isLoading}
              totalCount={totalCount}
            />
          )}
        </ErrorBoundary>
      </div>
    </main>
  )
}
