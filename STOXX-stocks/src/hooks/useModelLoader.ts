// ============================================
// useModelLoader Hook
// ============================================

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { modelService, type ModelStatus } from '@/lib/ml'

interface UseModelLoaderResult {
  isLoaded: boolean
  isLoading: boolean
  status: ModelStatus
  error: string | null
  loadModel: () => Promise<void>
  unloadModel: () => Promise<void>
}

/**
 * Hook for managing TensorFlow.js model loading state
 * 
 * Features:
 * - Tracks model loading status
 * - Auto-loads on first prediction request
 * - Shows loading indicator to user
 * - Handles cleanup on unmount
 */
export function useModelLoader(): UseModelLoaderResult {
  const [status, setStatus] = useState<ModelStatus>(modelService.getModelStatus())
  const [error, setError] = useState<string | null>(modelService.getError())
  const mountedRef = useRef(true)

  // Update status when model service changes
  useEffect(() => {
    const checkStatus = () => {
      if (!mountedRef.current) return
      
      const currentStatus = modelService.getModelStatus()
      const currentError = modelService.getError()
      
      setStatus(currentStatus)
      setError(currentError)
    }

    // Poll for status changes (since TF.js doesn't emit events)
    const interval = setInterval(checkStatus, 500)
    
    return () => {
      clearInterval(interval)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * Load the model
   */
  const loadModel = useCallback(async () => {
    try {
      setError(null)
      await modelService.loadModel()
      if (mountedRef.current) {
        setStatus(modelService.getModelStatus())
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load model')
        setStatus('error')
      }
    }
  }, [])

  /**
   * Unload the model to free memory
   */
  const unloadModel = useCallback(async () => {
    await modelService.disposeModel()
    if (mountedRef.current) {
      setStatus('idle')
      setError(null)
    }
  }, [])

  return {
    isLoaded: status === 'ready',
    isLoading: status === 'loading',
    status,
    error,
    loadModel,
    unloadModel,
  }
}
