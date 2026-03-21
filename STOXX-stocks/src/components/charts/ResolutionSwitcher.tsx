'use client'

import React from 'react'
import type { TimeResolution } from '@/types'

interface ResolutionSwitcherProps {
  activeResolution: TimeResolution
  onChange: (resolution: TimeResolution) => void
}

const RESOLUTIONS: { value: TimeResolution; label: string; description: string }[] = [
  { value: '5d', label: '5D', description: 'Last 5 days' },
  { value: '1m', label: '1M', description: 'Last month' },
  { value: '6m', label: '6M', description: 'Last 6 months' },
  { value: '1y', label: '1Y', description: 'Last year' },
  { value: '5y', label: '5Y', description: 'Last 5 years' },
]

export function ResolutionSwitcher({ activeResolution, onChange }: ResolutionSwitcherProps) {
  return (
    <div 
      className="flex items-center gap-1 bg-background-tertiary rounded-lg p-1"
      role="tablist"
      aria-label="Chart time resolution"
    >
      {RESOLUTIONS.map(({ value, label, description }) => (
        <button
          key={value}
          role="tab"
          aria-selected={activeResolution === value}
          aria-controls="price-chart"
          onClick={() => onChange(value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault()
              const currentIndex = RESOLUTIONS.findIndex(r => r.value === activeResolution)
              const nextIndex = e.key === 'ArrowRight'
                ? (currentIndex + 1) % RESOLUTIONS.length
                : (currentIndex - 1 + RESOLUTIONS.length) % RESOLUTIONS.length
              onChange(RESOLUTIONS[nextIndex].value)
            }
          }}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors touch-target focus-visible-ring ${
            activeResolution === value
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
          }`}
          tabIndex={activeResolution === value ? 0 : -1}
          title={description}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default ResolutionSwitcher
