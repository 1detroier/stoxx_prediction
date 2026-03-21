'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, variant: ToastVariant = 'info', duration: number = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    setToasts((prev) => [...prev, { id, message, variant, duration }])

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onDismiss: () => void
}

const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-accent-success/10',
    border: 'border-accent-success',
    icon: '✓',
  },
  error: {
    bg: 'bg-accent-danger/10',
    border: 'border-accent-danger',
    icon: '✕',
  },
  warning: {
    bg: 'bg-accent-warning/10',
    border: 'border-accent-warning',
    icon: '⚠',
  },
  info: {
    bg: 'bg-accent/10',
    border: 'border-accent',
    icon: 'ℹ',
  },
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const styles = variantStyles[toast.variant]

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-lg p-4 shadow-lg animate-slide-in-right`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-sm font-bold ${
            toast.variant === 'success'
              ? 'bg-accent-success/20 text-accent-success'
              : toast.variant === 'error'
              ? 'bg-accent-danger/20 text-accent-danger'
              : toast.variant === 'warning'
              ? 'bg-accent-warning/20 text-accent-warning'
              : 'bg-accent/20 text-accent'
          }`}
          aria-hidden="true"
        >
          {styles.icon}
        </span>
        <p className="flex-1 text-sm text-text-primary">{toast.message}</p>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded"
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default ToastProvider
