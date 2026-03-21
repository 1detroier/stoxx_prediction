'use client'

import React from 'react'
import type { PredictionDirection } from '@/types'

interface DirectionIndicatorProps {
  direction: PredictionDirection
  size?: 'sm' | 'md' | 'lg'
}

const sizeConfig = {
  sm: {
    container: 'w-16 h-16',
    icon: 'text-2xl',
    label: 'text-sm',
  },
  md: {
    container: 'w-24 h-24',
    icon: 'text-4xl',
    label: 'text-lg',
  },
  lg: {
    container: 'w-32 h-32',
    icon: 'text-5xl',
    label: 'text-xl',
  },
}

export function DirectionIndicator({ direction, size = 'md' }: DirectionIndicatorProps) {
  const config = sizeConfig[size]

  const isUp = direction === 'UP'
  const isDown = direction === 'DOWN'
  const isNeutral = direction === 'NEUTRAL'

  const bgColor = isUp
    ? 'bg-accent-success/20'
    : isDown
    ? 'bg-accent-danger/20'
    : 'bg-border'

  const borderColor = isUp
    ? 'border-accent-success'
    : isDown
    ? 'border-accent-danger'
    : 'border-border'

  const textColor = isUp
    ? 'text-accent-success'
    : isDown
    ? 'text-accent-danger'
    : 'text-text-secondary'

  const ariaLabel = `Predicted direction: ${direction}${isUp ? ' (price expected to rise)' : isDown ? ' (price expected to fall)' : ' (no clear direction)'}`

  return (
    <div
      className={`flex flex-col items-center justify-center ${config.container} rounded-full border-2 ${bgColor} ${borderColor}`}
      role="img"
      aria-label={ariaLabel}
    >
      <span 
        className={`${config.icon} ${textColor}`}
        aria-hidden="true"
      >
        {isUp ? '↑' : isDown ? '↓' : '―'}
      </span>
      <span className={`font-bold ${config.label} ${textColor}`}>
        {direction}
      </span>
    </div>
  )
}

export default DirectionIndicator
