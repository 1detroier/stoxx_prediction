'use client'

import React from 'react'
import { SECTORS, COUNTRIES, EXCHANGES } from '@/types'

interface FilterBarProps {
  filters: {
    sector?: string
    country?: string
    exchange?: string
    is_distressed?: boolean
  }
  onFilterChange: (filters: FilterBarProps['filters']) => void
  onClearFilters: () => void
}

export function FilterBar({ filters, onFilterChange, onClearFilters }: FilterBarProps) {
  const hasActiveFilters = filters.sector || filters.country || filters.exchange || filters.is_distressed

  const handleSectorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, sector: e.target.value || undefined })
  }

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, country: e.target.value || undefined })
  }

  const handleExchangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, exchange: e.target.value || undefined })
  }

  const handleDistressToggle = () => {
    onFilterChange({ ...filters, is_distressed: !filters.is_distressed })
  }

  return (
    <div 
      className="flex flex-wrap items-center gap-3 p-4 bg-background-secondary rounded-lg border border-border"
      role="search"
      aria-label="Filter companies"
    >
      {/* Sector Filter */}
      <div className="flex flex-col gap-1">
        <label htmlFor="sector-filter" className="text-xs text-text-secondary">
          Sector
        </label>
        <select
          id="sector-filter"
          value={filters.sector || ''}
          onChange={handleSectorChange}
          className="text-sm min-w-[140px] touch-target"
          aria-describedby="sector-filter-desc"
        >
          <option value="">All Sectors</option>
          {SECTORS.map((sector) => (
            <option key={sector} value={sector}>
              {sector}
            </option>
          ))}
        </select>
        <span id="sector-filter-desc" className="sr-only">
          Filter companies by sector
        </span>
      </div>

      {/* Country Filter */}
      <div className="flex flex-col gap-1">
        <label htmlFor="country-filter" className="text-xs text-text-secondary">
          Country
        </label>
        <select
          id="country-filter"
          value={filters.country || ''}
          onChange={handleCountryChange}
          className="text-sm min-w-[140px] touch-target"
          aria-describedby="country-filter-desc"
        >
          <option value="">All Countries</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
        <span id="country-filter-desc" className="sr-only">
          Filter companies by country
        </span>
      </div>

      {/* Exchange Filter */}
      <div className="flex flex-col gap-1">
        <label htmlFor="exchange-filter" className="text-xs text-text-secondary">
          Exchange
        </label>
        <select
          id="exchange-filter"
          value={filters.exchange || ''}
          onChange={handleExchangeChange}
          className="text-sm min-w-[120px] touch-target"
          aria-describedby="exchange-filter-desc"
        >
          <option value="">All Exchanges</option>
          {EXCHANGES.map((exchange) => (
            <option key={exchange} value={exchange}>
              {exchange}
            </option>
          ))}
        </select>
        <span id="exchange-filter-desc" className="sr-only">
          Filter companies by exchange
        </span>
      </div>

      {/* Distress Toggle */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-text-secondary" id="distress-label">
          Status
        </span>
        <button
          id="distress-filter"
          onClick={handleDistressToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleDistressToggle()
            }
          }}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
            filters.is_distressed
              ? 'bg-accent-danger/20 border-accent-danger text-accent-danger'
              : 'bg-background-tertiary border-border text-text-secondary hover:border-accent'
          }`}
          aria-pressed={filters.is_distressed}
          aria-labelledby="distress-label"
        >
          {filters.is_distressed ? '⚠️ Distressed Only' : 'All Status'}
        </button>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className="flex flex-col gap-1 ml-auto">
          <span className="text-xs text-transparent">Action</span>
          <button
            onClick={onClearFilters}
            className="px-3 py-2 text-sm text-accent hover:text-accent-hover transition-colors touch-target focus-visible-ring rounded"
            aria-label="Clear all filters"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  )
}

export default FilterBar
