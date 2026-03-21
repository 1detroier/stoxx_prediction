// ============================================
// ML Type Definitions for TensorFlow.js
// ============================================

/**
 * Z-Score normalization parameters for feature scaling
 */
export interface ZScoreParams {
  [feature: string]: {
    mean: number
    std: number
  }
}

/**
 * Single prediction result from model inference
 */
export interface PredictionResult {
  direction: 'UP' | 'DOWN' | 'NEUTRAL'
  confidence: number
  rawProbability: number
  modelVersion: string
  timestamp: string
}

/**
 * Feature vector for model input
 * Shape: [timesteps, features] - typically [60, 12]
 */
export type FeatureVector = number[]

/**
 * Model status for loading state tracking
 */
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Model metadata from the API
 */
export interface ModelMetadata {
  version: string
  training_date: string | null
  training_accuracy: number | null
  distressed_accuracy: number | null
  zscore_params: ZScoreParams | null
  features_hash: string | null
  storage_path: string | null
}

/**
 * Feature extraction result
 */
export interface ExtractedFeatures {
  features: number[]
  featureNames: string[]
  metadata: {
    return1m: number
    return6m: number
    return9m: number
    volatility: number
  }
}

/**
 * Comparison data point for prediction vs reality chart
 */
export interface ComparisonDataPoint {
  date: string
  predicted: number | null
  actual: number | null
  isCorrect: boolean | null
}

/**
 * Chart data for prediction vs reality visualization
 */
export interface PredictionRealityData {
  ticker: string
  dataPoints: ComparisonDataPoint[]
  accuracy: number | null
  totalPredictions: number
  correctPredictions: number
}

/**
 * Feature names used by the model (must match Python PANEL_FEATURES — 18 features)
 * Order MUST match the model's expected input order.
 *
 * Feature groups:
 *   Returns (4):  return_1d, return_1m, return_6m, return_9m
 *   Z-Returns (4): z_return_1d, z_return_1m, z_return_6m, z_return_9m
 *   Vol/Volume (3): volatility_20d, atr_ratio, volume_ratio
 *   Momentum (4): rsi_14, macd, macd_signal, macd_hist
 *   European (3): eur_strength, cross_border, ecb_policy_phase
 */
export const FEATURE_NAMES = [
  'return_1d', 'return_1m', 'return_6m', 'return_9m',        // Log returns (4)
  'z_return_1d', 'z_return_1m', 'z_return_6m', 'z_return_9m', // Z-scored returns (4)
  'volatility_20d', 'atr_ratio', 'volume_ratio',                // Volatility/Volume (3)
  'rsi_14', 'macd', 'macd_signal', 'macd_hist',                 // Momentum (4)
  'eur_strength', 'cross_border', 'ecb_policy_phase'            // European (3)
  // Total: 18
] as const

export type FeatureName = typeof FEATURE_NAMES[number]

/**
 * Model input configuration
 */
export const MODEL_CONFIG = {
  // Input shape: [batch, timesteps, features]
  timesteps: 60,
  features: FEATURE_NAMES.length,  // 18
  // Model output: probability of price going up
  outputShape: [1],
  // Cache TTL in milliseconds (5 minutes)
  cacheTTL: 5 * 60 * 1000,
  // Default model path (TFJS distress model)
  defaultModelPath: '/models/distress/model.json',
} as const
