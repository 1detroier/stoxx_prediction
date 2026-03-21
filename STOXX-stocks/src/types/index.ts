// ============================================
// STOXX-stocks Type Definitions
// ============================================

// ============================================
// Database Models
// ============================================

export interface Company {
  ticker: string
  name: string
  exchange: string
  sector: string
  country: string
  is_distressed: boolean
  created_at?: string
}

export interface Price {
  id?: number
  ticker: string
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  adjusted_close: number | null
  volume: number | null
}

export interface Model {
  id: string
  version: string
  is_stable: boolean
  training_date: string | null
  git_commit_hash: string | null
  training_accuracy: number | null
  distressed_accuracy: number | null
  zscore_params: ZScoreParams | null
  features_hash: string | null
  storage_path: string | null
  created_at?: string
}

export interface Prediction {
  id?: number
  ticker: string
  model_version: string
  predicted_at: string
  prediction_window_days: number
  predicted_direction: boolean
  confidence: number | null
  actual_direction: boolean | null
  was_correct: boolean | null
  created_at?: string
}

// ============================================
// ML Types
// ============================================

export interface ZScoreParams {
  [feature: string]: {
    mean: number
    std: number
  }
}

export type PredictionDirection = 'UP' | 'DOWN' | 'NEUTRAL'

export interface ModelPrediction {
  direction: PredictionDirection
  confidence: number
  ticker: string
  modelVersion: string
  timestamp: string
}

// Re-export ML types from lib/ml
export type {
  FeatureVector,
  ModelStatus,
  PredictionResult,
  ModelMetadata,
  PredictionRealityData,
  ComparisonDataPoint,
  ExtractedFeatures,
} from '@/lib/ml'

// ============================================
// API Request/Response Types
// ============================================

export interface CompaniesResponse {
  companies: Company[]
  total: number
  limit?: number
  offset?: number
}

export interface PricesResponse {
  ticker: string
  prices: Price[]
  count: number
}

export interface ModelResponse {
  version: string
  training_date: string | null
  training_accuracy: number | null
  distressed_accuracy: number | null
  zscore_params: ZScoreParams | null
  features_hash: string | null
  git_commit_hash: string | null
  storage_path: string | null
}

export interface PredictionsResponse {
  ticker: string
  predictions: Prediction[]
  count: number
}

export interface FinnhubQuote {
  symbol: string
  price: number
  change: number
  change_percent: number
  timestamp: number
  high?: number
  low?: number
  open?: number
  previous_close?: number
}

// Legacy type for direct Finnhub API response
export interface FinnhubRawQuote {
  c: number    // Current price
  d: number    // Change
  dp: number   // Percent change
  h: number    // High of day
  l: number    // Low of day
  o: number    // Open of day
  pc: number   // Previous close price
  t: number    // Timestamp
}

export interface FinnhubSymbolLookup {
  count: number
  result: Array<{
    description: string
    displaySymbol: string
    symbol: string
    type: string
  }>
}

// ============================================
// Filter Types
// ============================================

export interface CompanyFilters {
  sector?: string
  country?: string
  exchange?: string
  is_distressed?: boolean
  search?: string
}

export interface PriceFilters {
  ticker: string
  start_date?: string
  end_date?: string
  resolution?: 'daily' | '60min'
}

export interface CreatePredictionInput {
  ticker: string
  model_version: string
  predicted_direction: boolean
  confidence?: number | null
  prediction_window_days?: number
}

export interface ApiErrorResponse {
  error: string
  message: string
  details?: Record<string, string[]>
}

// ============================================
// Chart Types
// ============================================

export type TimeResolution = '5d' | '1m' | '6m' | '1y' | '5y'

export interface ChartDataPoint {
  time: string | number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

// ============================================
// Sector and Country Lists
// ============================================

export const SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Materials',
  'Utilities',
  'Real Estate',
  'Telecommunications',
] as const

export const COUNTRIES = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'PT', name: 'Portugal' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'GB', name: 'United Kingdom' },
] as const

export const EXCHANGES = [
  'XAMS',  // Amsterdam
  'XBRU',  // Brussels
  'XCSE',  // Copenhagen
  'XETR',  // Frankfurt
  'XHEL',  // Helsinki
  'XLON',  // London
  'XMAD',  // Madrid
  'XMIL',  // Milan
  'XPAR',  // Paris
  'XSTO',  // Stockholm
  'XSWX',  // Zurich
  'XDUB',  // Dublin
] as const

// ============================================
// Utility Types
// ============================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

export interface ApiError {
  message: string
  code?: string
  status?: number
}
