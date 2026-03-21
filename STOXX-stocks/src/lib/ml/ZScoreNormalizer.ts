// ============================================
// Z-Score Normalization Module
// ============================================

import type { ZScoreParams, FeatureName, FEATURE_NAMES } from './types'

/**
 * ZScoreNormalizer applies Z-score normalization to features
 * using parameters computed during model training.
 * 
 * Formula: normalized = (value - mean) / std
 */
export class ZScoreNormalizer {
  private params: ZScoreParams | null = null
  private featureNames: string[] = []

  /**
   * Set the normalization parameters
   */
  setParams(params: ZScoreParams): void {
    this.params = params
    this.featureNames = Object.keys(params)
  }

  /**
   * Get the current feature names from params
   */
  getFeatureNames(): string[] {
    return [...this.featureNames]
  }

  /**
   * Validate that params have all required features
   */
  validateParams(params: ZScoreParams, requiredFeatures: readonly string[]): boolean {
    for (const feature of requiredFeatures) {
      if (!(feature in params)) {
        console.warn(`Missing parameter for feature: ${feature}`)
        return false
      }
      
      const param = params[feature]
      if (param.mean === undefined || param.std === undefined) {
        console.warn(`Invalid parameter structure for feature: ${feature}`)
        return false
      }
      
      if (param.std === 0) {
        console.warn(`Standard deviation is zero for feature: ${feature}`)
        return false
      }
    }
    return true
  }

  /**
   * Normalize a single value using Z-score formula
   */
  normalizeValue(value: number, mean: number, std: number): number {
    if (std === 0) {
      return 0 // Avoid division by zero
    }
    return (value - mean) / std
  }

  /**
   * Normalize an array of features using Z-score parameters
   * 
   * @param features - Raw feature values in order of featureNames
   * @param params - Z-score parameters (if not already set)
   * @returns Normalized feature array
   */
  normalize(
    features: number[],
    params?: ZScoreParams
  ): number[] {
    // Use provided params or fall back to stored params
    const normalizationParams = params || this.params
    
    if (!normalizationParams) {
      console.warn('No normalization parameters available, returning raw features')
      return features
    }

    const normalizedFeatures: number[] = []
    const featureNames = Object.keys(normalizationParams)

    for (let i = 0; i < features.length; i++) {
      const featureName = featureNames[i] || `feature_${i}`
      
      if (featureName in normalizationParams) {
        const { mean, std } = normalizationParams[featureName]
        normalizedFeatures.push(this.normalizeValue(features[i], mean, std))
      } else {
        // Feature not in params - use 0 (neutral) or raw value
        console.warn(`No params for feature at index ${i}: ${featureName}`)
        normalizedFeatures.push(0)
      }
    }

    return normalizedFeatures
  }

  /**
   * Denormalize a normalized value back to original scale
   */
  denormalize(normalizedValue: number, mean: number, std: number): number {
    return normalizedValue * std + mean
  }

  /**
   * Check if params are loaded
   */
  isReady(): boolean {
    return this.params !== null && this.featureNames.length > 0
  }

  /**
   * Get current params
   */
  getParams(): ZScoreParams | null {
    return this.params
  }

  /**
   * Reset normalizer state
   */
  reset(): void {
    this.params = null
    this.featureNames = []
  }
}

// Export singleton instance for convenience
export const zScoreNormalizer = new ZScoreNormalizer()
