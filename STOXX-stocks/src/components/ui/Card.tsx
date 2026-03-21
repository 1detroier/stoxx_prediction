'use client'

import React, { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  header?: ReactNode
  footer?: ReactNode
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({
  children,
  className = '',
  padding = 'md',
  header,
  footer,
}: CardProps) {
  return (
    <div
      className={`bg-background-secondary rounded-lg border border-border ${className}`}
    >
      {header && (
        <div className="px-4 py-3 border-b border-border">
          {header}
        </div>
      )}
      <div className={paddingClasses[padding]}>
        {children}
      </div>
      {footer && (
        <div className="px-4 py-3 border-t border-border">
          {footer}
        </div>
      )}
    </div>
  )
}

export default Card
