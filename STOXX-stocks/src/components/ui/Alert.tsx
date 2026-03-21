'use client'

import React, { ReactNode } from 'react'

type AlertVariant = 'info' | 'warning' | 'error' | 'success'

interface AlertProps {
  variant?: AlertVariant
  children: ReactNode
  onDismiss?: () => void
  className?: string
}

const variantStyles: Record<AlertVariant, { bg: string; border: string; icon: string; text: string }> = {
  info: {
    bg: 'bg-accent/10',
    border: 'border-accent',
    icon: '💡',
    text: 'text-accent',
  },
  warning: {
    bg: 'bg-accent-warning/10',
    border: 'border-accent-warning',
    icon: '⚠️',
    text: 'text-accent-warning',
  },
  error: {
    bg: 'bg-accent-danger/10',
    border: 'border-accent-danger',
    icon: '🚨',
    text: 'text-accent-danger',
  },
  success: {
    bg: 'bg-accent-success/10',
    border: 'border-accent-success',
    icon: '✅',
    text: 'text-accent-success',
  },
}

export function Alert({ 
  variant = 'info', 
  children, 
  onDismiss,
  className = '' 
}: AlertProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-lg p-4 flex items-start gap-3 ${className}`}
      role="alert"
    >
      <span className="text-xl flex-shrink-0" aria-hidden="true">
        {styles.icon}
      </span>
      <div className="flex-1 text-text-primary text-sm">
        {children}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default Alert
