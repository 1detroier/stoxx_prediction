'use client'

import React from 'react'

interface ConfidenceMeterProps {
  confidence: number // 0-1 range
  showPercentage?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeConfig = {
  sm: {
    bar: 'h-2',
    text: 'text-xs',
  },
  md: {
    bar: 'h-3',
    text: 'text-sm',
  },
  lg: {
    bar: 'h-4',
    text: 'text-base',
  },
}

export function ConfidenceMeter({ confidence, showPercentage = true, size = 'md' }: ConfidenceMeterProps) {
  const percentage = Math.round(confidence * 100)
  const config = sizeConfig[size]

  // Color based on confidence level
  const getColor = () => {
    if (percentage < 50) return 'bg-accent-danger'
    if (percentage < 70) return 'bg-accent-warning'
    return 'bg-accent-success'
  }

  const colorClass = getColor()
  const colorTextClass = colorClass.replace('bg-', 'text-')

  return (
    <div className="space-y-1">
      {showPercentage && (
        <div className="flex items-center justify-between">
          <span className={`${config.text} text-text-secondary`}>Confidence</span>
          <span 
            className={`${config.text} font-semibold ${colorTextClass}`}
            aria-live="polite"
          >
            {percentage}%
          </span>
        </div>
      )}
      <div 
        className={`w-full bg-background-tertiary rounded-full overflow-hidden ${config.bar}`}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence level: ${percentage}%`}
      >
        <div
          className={`h-full ${colorClass} transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export default ConfidenceMeter
