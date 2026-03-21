'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Company, CompanyFilters } from '@/types'
import { CompanyCard } from './CompanyCard'
import { FilterBar } from './FilterBar'
import { LoadingSpinner, SkeletonCard } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface CompanySelectorProps {
  companies: Company[]
  isLoading?: boolean
  totalCount?: number
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Loading companies">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div 
      className="text-center py-12 bg-background-secondary rounded-lg border border-border"
      role="status"
    >
      <p className="text-text-secondary">No companies found matching your criteria.</p>
      <button
        onClick={onClear}
        className="mt-2 text-accent hover:text-accent-hover touch-target"
        aria-label="Clear all filters to show all companies"
      >
        Clear filters
      </button>
    </div>
  )
}

export function CompanySelector({ companies, isLoading = false, totalCount = 0 }: CompanySelectorProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filters, setFilters] = useState<CompanyFilters>({})

  // Debounced search
  const debouncedSearch = useMemo(() => {
    let timeoutId: NodeJS.Timeout
    return (value: string) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setFilters((prev) => ({ ...prev, search: value || undefined }))
      }, 300)
    }
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    debouncedSearch(value)
  }

  const handleFilterChange = useCallback((newFilters: CompanyFilters) => {
    setFilters(newFilters)
    showToast('Filters updated', 'info', 2000)
  }, [showToast])

  const handleClearFilters = useCallback(() => {
    setFilters({})
    setSearchQuery('')
    showToast('Filters cleared', 'info', 2000)
  }, [showToast])

  const handleCompanyClick = useCallback((company: Company) => {
    router.push(`/stock/${company.ticker}`)
  }, [router])

  // Filter companies client-side for immediate feedback
  const filteredCompanies = useMemo(() => {
    return companies.filter((company) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchesSearch =
          company.ticker.toLowerCase().includes(searchLower) ||
          company.name.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Sector filter
      if (filters.sector && company.sector !== filters.sector) {
        return false
      }

      // Country filter
      if (filters.country && company.country !== filters.country) {
        return false
      }

      // Exchange filter
      if (filters.exchange && company.exchange !== filters.exchange) {
        return false
      }

      // Distress filter
      if (filters.is_distressed && !company.is_distressed) {
        return false
      }

      return true
    })
  }, [companies, filters])

  const hasActiveFilters = filters.search || filters.sector || filters.country || filters.exchange || filters.is_distressed

  return (
    <div className="space-y-4" role="region" aria-label="Company list">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Companies</h2>
          <p className="text-sm text-text-secondary">
            {hasActiveFilters ? (
              <>Showing {filteredCompanies.length} of {totalCount || companies.length} companies</>
            ) : (
              <>{totalCount || companies.length} companies available</>
            )}
          </p>
        </div>

        {/* View Toggle */}
        <div 
          className="flex items-center gap-2" 
          role="tablist"
          aria-label="View mode"
        >
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-2 rounded-lg transition-colors touch-target ${
              view === 'grid'
                ? 'bg-accent text-white'
                : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
            }`}
            role="tab"
            aria-selected={view === 'grid'}
            aria-controls="company-grid"
            aria-label="Grid view"
          >
            ▦
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-2 rounded-lg transition-colors touch-target ${
              view === 'list'
                ? 'bg-accent text-white'
                : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
            }`}
            role="tab"
            aria-selected={view === 'list'}
            aria-controls="company-grid"
            aria-label="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <label htmlFor="company-search" className="sr-only">
          Search companies
        </label>
        <input
          id="company-search"
          type="text"
          placeholder="Search by ticker or company name..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full pl-10 pr-4 touch-target"
          aria-describedby="search-description"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true">
          🔍
        </span>
        <span id="search-description" className="sr-only">
          Type to search for companies by ticker or name. Results update automatically.
        </span>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* Company List */}
      {isLoading ? (
        <SkeletonGrid />
      ) : filteredCompanies.length === 0 ? (
        <EmptyState onClear={handleClearFilters} />
      ) : view === 'grid' ? (
        <div 
          id="company-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          role="tabpanel"
          aria-label="Company cards"
        >
          {filteredCompanies.map((company) => (
            <CompanyCard
              key={company.ticker}
              company={company}
              onClick={handleCompanyClick}
              view="grid"
            />
          ))}
        </div>
      ) : (
        <div 
          id="company-grid"
          className="bg-background-secondary rounded-lg border border-border overflow-hidden"
          role="tabpanel"
          aria-label="Company list"
        >
          {/* List Header */}
          <div 
            className="flex items-center justify-between px-4 py-2 border-b border-border text-xs text-text-secondary font-medium bg-background-tertiary"
            role="row"
            aria-label="Column headers"
          >
            <span className="flex-1">Ticker</span>
            <span className="flex-1">Name</span>
            <span className="flex-1">Exchange</span>
            <span className="flex-1">Sector</span>
            <span className="w-24 text-right">Status</span>
          </div>
          {/* List Items */}
          <div 
            className="max-h-[500px] overflow-y-auto"
            role="rowgroup"
          >
            {filteredCompanies.map((company) => (
              <CompanyCard
                key={company.ticker}
                company={company}
                onClick={handleCompanyClick}
                view="list"
              />
            ))}
          </div>
        </div>
      )}

      {/* Results Summary for Screen Readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {filteredCompanies.length === companies.length
          ? `Showing all ${companies.length} companies`
          : `Showing ${filteredCompanies.length} of ${companies.length} companies after filtering`}
      </div>
    </div>
  )
}

export default CompanySelector
