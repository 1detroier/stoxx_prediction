'use client'

import React, { memo } from 'react'
import type { Company } from '@/types'
import { Card } from '@/components/ui'

interface CompanyCardProps {
  company: Company
  onClick?: (company: Company) => void
  view?: 'grid' | 'list'
}

export const CompanyCard = memo(function CompanyCard({
  company,
  onClick,
  view = 'grid',
}: CompanyCardProps) {
  const handleClick = () => {
    if (onClick) {
      onClick(company)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const isDistressed = company.is_distressed

  const cardContent = (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-text-primary">{company.ticker}</h3>
            <p className="text-sm text-text-secondary line-clamp-1">{company.name}</p>
          </div>
          {isDistressed && (
            <span className="badge badge-danger text-xs" role="status" aria-label="Distressed company">
              ⚠️
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs text-text-muted">{company.exchange}</span>
          <span className="text-xs text-text-muted">•</span>
          <span className="text-xs text-text-muted">{company.country}</span>
        </div>
        <span className="badge badge-neutral mt-1">{company.sector}</span>
      </div>
    </>
  )

  if (view === 'list') {
    return (
      <div
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`px-4 py-3 border-b border-border hover:bg-background-hover cursor-pointer transition-colors touch-target ${
          isDistressed ? 'border-l-4 border-l-accent-danger' : ''
        }`}
        role="button"
        tabIndex={0}
        aria-label={`${company.ticker}: ${company.name}. ${company.exchange} exchange, ${company.sector} sector${isDistressed ? ', distressed' : ''}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="font-semibold text-text-primary">{company.ticker}</span>
              <span className="text-sm text-text-secondary">{company.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-text-secondary">{company.exchange}</span>
            <span className="badge badge-neutral">{company.sector}</span>
            {isDistressed && (
              <span className="badge badge-danger">Distressed</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`bg-background-secondary rounded-lg border transition-all hover:border-accent hover:bg-background-hover cursor-pointer touch-target focus-visible-ring ${
        isDistressed
          ? 'border-accent-danger/50 hover:border-accent-danger'
          : 'border-border'
      }`}
      role="button"
      tabIndex={0}
      aria-label={`${company.ticker}: ${company.name}. ${company.exchange} exchange, ${company.sector} sector${isDistressed ? ', distressed' : ''}`}
    >
      <Card
        padding="md"
        className="h-full border-0 bg-transparent hover:bg-transparent"
      >
        {cardContent}
      </Card>
    </div>
  )
})

export default CompanyCard
