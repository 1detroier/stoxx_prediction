'use client'

import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /** Custom error title */
  title?: string
  /** Show error details (stack trace) */
  showDetails?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { title = 'Something went wrong', showDetails = false } = this.props
      const errorMessage = this.state.error?.message || 'An unexpected error occurred'
      const errorStack = this.state.errorInfo?.componentStack

      return (
        <div 
          className="flex flex-col items-center justify-center p-6 bg-background-secondary rounded-lg border border-accent-danger/50"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-accent-danger text-5xl mb-4" aria-hidden="true">⚠️</div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {title}
          </h3>
          <p className="text-text-secondary text-center mb-4 max-w-md">
            {errorMessage}
          </p>
          
          {showDetails && errorStack && (
            <details className="w-full max-w-md mb-4">
              <summary className="cursor-pointer text-sm text-text-muted hover:text-text-secondary">
                Show technical details
              </summary>
              <pre className="mt-2 p-3 bg-background-tertiary rounded text-xs text-text-muted overflow-x-auto whitespace-pre-wrap">
                {this.state.error?.stack}
              </pre>
            </details>
          )}

          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="btn btn-primary touch-target"
              aria-label="Try again to recover from this error"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="btn btn-secondary touch-target"
              aria-label="Reload the page"
            >
              Reload Page
            </button>
          </div>
          
          <p className="text-text-muted text-xs mt-4">
            If this problem persists, please try refreshing the page or contact support.
          </p>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
