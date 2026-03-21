// ============================================
// Feature Extraction Module
// ============================================
//
// Transforms raw price data into the 18 features expected by the LSTM model.
// Feature order MUST match FEATURE_NAMES (18 features) and Python PANEL_FEATURES.
//
// Feature groups:
//   Returns (4):      return_1d, return_1m, return_6m, return_9m
//   Z-Returns (4):   z_return_1d, z_return_1m, z_return_6m, z_return_9m
//   Vol/Volume (3):  volatility_20d, atr_ratio, volume_ratio
//   Momentum (4):    rsi_14, macd, macd_signal, macd_hist
//   European (3):   eur_strength, cross_border, ecb_policy_phase
//
// Z-score params (mean/std) for z_return features come from model metadata.

import type { Price } from '@/types'
import { FEATURE_NAMES, type ExtractedFeatures } from './types'

export class FeatureExtractor {
  // Z-score parameters for z_return features (from model training)
  private zReturnParams: Record<string, { mean: number; std: number }> = {}

  /**
   * Set z-score parameters for z_return normalization.
   * Must be called before prepareForModel() if z_return features are used.
   */
  setZScoreParams(params: Record<string, { mean: number; std: number }>): void {
    this.zReturnParams = params
  }

  /**
   * Calculate log return between two prices.
   * Uses LOG returns to match Python feature_engineer.py.
   */
  private logReturn(current: number, previous: number): number {
    if (previous <= 0 || current <= 0) return 0
    return Math.log(current / previous)
  }

  /**
   * Calculate rolling standard deviation of an array.
   */
  private rollingStd(values: number[], window: number): number {
    if (values.length < window) return 0
    const slice = values.slice(-window)
    if (slice.length < 2) return 0
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (slice.length - 1)
    return Math.sqrt(variance)
  }

  /**
   * Calculate Simple Moving Average.
   */
  private sma(values: number[], period: number): number {
    const slice = values.slice(-Math.min(period, values.length))
    if (slice.length === 0) return 0
    return slice.reduce((s, v) => s + v, 0) / slice.length
  }

  /**
   * Calculate Exponential Moving Average.
   */
  private ema(values: number[], period: number): number {
    const slice = values.slice(-Math.min(period * 2, values.length))
    if (slice.length < 2) {
      return slice.length === 1 ? slice[0] : 0
    }
    const multiplier = 2 / (period + 1)
    let emaVal = slice.slice(0, period).reduce((s, v) => s + v, 0) / period
    for (let i = period; i < slice.length; i++) {
      emaVal = (slice[i] - emaVal) * multiplier + emaVal
    }
    return emaVal
  }

  /**
   * Calculate True Range (part of ATR).
   */
  private trueRange(
    high: number,
    low: number,
    prevClose: number
  ): number {
    const hl = high - low
    const hpc = Math.abs(high - prevClose)
    const lpc = Math.abs(low - prevClose)
    return Math.max(hl, Math.max(hpc, lpc))
  }

  /**
   * Calculate RSI (Relative Strength Index).
   */
  private rsi14(returns: number[]): number {
    if (returns.length < 15) return 50
    const recent = returns.slice(-14)
    let avgGain = 0
    let avgLoss = 0
    for (let i = 0; i < recent.length; i++) {
      if (recent[i] >= 0) avgGain += recent[i]
      else avgLoss += Math.abs(recent[i])
    }
    avgGain /= 14
    avgLoss /= 14
    if (avgLoss === 0) return 100
    return 100 - 100 / (1 + avgGain / avgLoss)
  }

  /**
   * Extract all 18 features from raw price data.
   * Feature order matches FEATURE_NAMES exactly.
   */
  extractFeaturesFromPrices(prices: Price[]): ExtractedFeatures {
    const validPrices = prices
      .filter(p => p.close !== null && p.high !== null && p.low !== null)
      .sort((a, b) => a.date.localeCompare(b.date))

    if (validPrices.length < 200) {
      return this.getDefaultFeatures()
    }

    const n = validPrices.length

    // Extract arrays
    const closes = validPrices.map(p => p.close!)
    const highs = validPrices.map(p => p.high!)
    const lows = validPrices.map(p => p.low!)
    const volumes = validPrices.map(p => p.volume ?? 0)

    // --- Raw daily log returns ---
    const logReturns: number[] = []
    for (let i = 1; i < n; i++) {
      logReturns.push(this.logReturn(closes[i], closes[i - 1]))
    }

    // Price on different lookback windows
    const priceNow = closes[n - 1]
    const price1d  = closes[n - 2] ?? priceNow
    const price1m  = closes[Math.max(0, n - 1 - 21)] ?? priceNow
    const price6m  = closes[Math.max(0, n - 1 - 126)] ?? priceNow
    const price9m  = closes[Math.max(0, n - 1 - 189)] ?? priceNow

    // --- Group 1: Returns (4) ---
    const return1d = this.logReturn(priceNow, price1d)
    const return1m = this.logReturn(priceNow, price1m)
    const return6m = this.logReturn(priceNow, price6m)
    const return9m = this.logReturn(priceNow, price9m)

    // --- Group 2: Z-score returns (4) ---
    // Z-score = (raw - mean) / std  using training params
    const zReturn1d = this.zScore(return1d, 'z_return_1d')
    const zReturn1m = this.zScore(return1m, 'z_return_1m')
    const zReturn6m = this.zScore(return6m, 'z_return_6m')
    const zReturn9m = this.zScore(return9m, 'z_return_9m')

    // --- Group 3: Volatility / Volume (3) ---
    const volatility20d = this.rollingStd(logReturns, 20)
    // ATR ratio = ATR14 / close
    const atrValues: number[] = []
    for (let i = 1; i < n; i++) {
      const tr = this.trueRange(highs[i], lows[i], closes[i - 1])
      atrValues.push(tr)
    }
    const atr14 = this.sma(atrValues.slice(-14), 14)
    const atrRatio = atr14 / (priceNow + 1e-10)
    // Volume ratio = current volume / 20-day MA volume
    const volMA20 = this.sma(volumes, 20)
    const volumeRatio = volMA20 > 0 ? volumes[n - 1] / volMA20 : 1

    // --- Group 4: Momentum (4) ---
    const rsi = this.rsi14(logReturns)
    // Compute full MACD history for signal line
    const macdHistory: number[] = []
    for (let i = 26; i < closes.length; i++) {
      const e12 = this.ema(closes.slice(0, i + 1), 12)
      const e26 = this.ema(closes.slice(0, i + 1), 26)
      macdHistory.push(e12 - e26)
    }
    const macdFinal = macdHistory.length > 0 ? macdHistory[macdHistory.length - 1] : 0
    const macdSignalFinal = macdHistory.length > 0
      ? this.ema(macdHistory.slice(-50), 9)
      : 0
    const macdHist = macdFinal - macdSignalFinal

    // --- Group 5: European features (3) ---
    // eur_strength: 20-day rolling std of log returns (proxy for EUR/USD volatility)
    const eurStrength = this.rollingStd(logReturns, 20)
    // cross_border: volatility pattern — rolling 60d std > 0.02 threshold
    const vol60d = this.rollingStd(logReturns, 60)
    const crossBorder = vol60d > 0.02 ? 1 : 0
    // ecb_policy_phase: date-based rate regime (0=low<2020, 1=COVID 2020-2021, 2=high 2022+)
    const latestDate = new Date(validPrices[n - 1].date)
    const ecbPhase = latestDate.getFullYear() < 2020
      ? 0
      : latestDate.getFullYear() < 2022
        ? 1
        : 2

    // Build feature vector in FEATURE_NAMES order
    const features: number[] = [
      // Returns (4)
      return1d, return1m, return6m, return9m,
      // Z-score returns (4)
      zReturn1d, zReturn1m, zReturn6m, zReturn9m,
      // Vol/Volume (3)
      volatility20d, atrRatio, volumeRatio,
      // Momentum (4)
      rsi / 100, macdFinal, macdSignalFinal, macdHist,
      // European (3)
      eurStrength, crossBorder, ecbPhase,
    ]

    return {
      features,
      featureNames: [...FEATURE_NAMES],
      metadata: {
        return1m,
        return6m,
        return9m,
        volatility: volatility20d,
      },
    }
  }

  /**
   * Apply z-score normalization for a single value using stored params.
   */
  private zScore(value: number, featureName: string): number {
    const p = this.zReturnParams[featureName]
    if (!p || p.std === 0) return 0
    return (value - p.mean) / p.std
  }

  /**
   * Get default features when no data is available.
   */
  private getDefaultFeatures(): ExtractedFeatures {
    return {
      features: new Array(FEATURE_NAMES.length).fill(0),
      featureNames: [...FEATURE_NAMES],
      metadata: { return1m: 0, return6m: 0, return9m: 0, volatility: 0 },
    }
  }

  /**
   * Prepare features for model input.
   * Sets z-score params and returns the raw feature vector.
   * (Normalization is done by ZScoreNormalizer for non-z_return features.)
   */
  prepareForModel(
    prices: Price[],
    zscoreParams: Record<string, { mean: number; std: number }>
  ): number[] {
    // Set z-score params for z_return features
    this.setZScoreParams(zscoreParams)
    const extracted = this.extractFeaturesFromPrices(prices)

    // Apply normalization via ZScoreNormalizer for non-z_return features
    const normalized: number[] = []
    for (let i = 0; i < FEATURE_NAMES.length; i++) {
      const name = FEATURE_NAMES[i]
      const value = extracted.features[i]
      if (name.startsWith('z_return_')) {
        // Already z-scored in extractFeaturesFromPrices using zscoreParams
        normalized.push(value)
      } else if (name in zscoreParams) {
        // Z-normalize other features using training params
        const { mean, std } = zscoreParams[name]
        normalized.push(std > 0 ? (value - mean) / std : 0)
      } else {
        // No params — use raw value
        normalized.push(value)
      }
    }
    return normalized
  }
}

// Export singleton instance
export const featureExtractor = new FeatureExtractor()
