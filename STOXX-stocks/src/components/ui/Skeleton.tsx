'use client'

import React from 'react'

interface SkeletonProps {
  variant?: 'text' | 'card' | 'chart'
  className?: string
  lines?: number
}

const variantClasses = {
  text: 'h-4 bg-background-tertiary rounded',
  card: 'h-24 bg-background-tertiary rounded-lg',
  chart: 'h-64 bg-background-tertiary rounded-lg',
}

export function Skeleton({ variant = 'text', className = '', lines = 1 }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${variantClasses.text} ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={`${variantClasses[variant]} animate-pulse ${className}`}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-background-secondary rounded-lg border border-border p-4">
      <Skeleton variant="text" lines={3} />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="bg-background-secondary rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" className="w-32" />
        <Skeleton variant="text" className="w-24" />
      </div>
      <Skeleton variant="chart" />
    </div>
  )
}

export default Skeleton
