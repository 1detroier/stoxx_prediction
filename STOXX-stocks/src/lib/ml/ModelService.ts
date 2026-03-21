// ============================================
// TensorFlow.js Model Service
// ============================================
//
// IMPORTANT: TensorFlow.js is loaded DYNAMICALLY (not statically) to avoid
// bloating the client bundle. The @tensorflow/tfjs package is ~1.5-2MB
// and would cause ERR_INSUFFICIENT_RESOURCES on load if bundled statically.
//
// All tf.* calls are inside dynamic import() followed by await tf.ready()

import type {
  ModelStatus,
  PredictionResult,
  ZScoreParams,
  ModelMetadata,
} from './types'
import { zScoreNormalizer } from './ZScoreNormalizer'
import { featureExtractor } from './FeatureExtractor'

// Type for the dynamically loaded tf namespace
type TfNamespace = typeof import('@tensorflow/tfjs')

/**
 * ModelService manages TensorFlow.js model lifecycle
 * - Singleton pattern for single model instance
 * - Memory management with automatic disposal
 * - Z-score parameter caching
 * - Lazy-loads TensorFlow.js only when needed
 */
export class ModelService {
  private model: import('@tensorflow/tfjs').LayersModel | null = null
  private tf: TfNamespace | null = null
  private status: ModelStatus = 'idle'
  private lastUsed: number = 0
  private error: string | null = null
  private zscoreParams: ZScoreParams | null = null
  private modelVersion: string = ''
  private disposalTimer: NodeJS.Timeout | null = null
  
  // Configuration
  private readonly cacheTTL: number
  private readonly modelPath: string

  constructor(
    cacheTTL: number = 5 * 60 * 1000,
    modelPath: string = process.env.NEXT_PUBLIC_MODEL_PATH ?? '/models/distress/model.json'
  ) {
    this.cacheTTL = cacheTTL
    this.modelPath = modelPath
  }

  /**
   * Get current model status
   */
  getModelStatus(): ModelStatus {
    return this.status
  }

  /**
   * Get current error message
   */
  getError(): string | null {
    return this.error
  }

  /**
   * Check if model is ready for inference
   */
  isReady(): boolean {
    return this.status === 'ready' && this.model !== null
  }

  /**
   * Load Z-score parameters from API
   */
  async loadZScoreParams(): Promise<ZScoreParams> {
    try {
      const response = await fetch('/api/models/latest')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch model params: ${response.status}`)
      }

      const data: ModelMetadata = await response.json()
      
      if (!data.zscore_params) {
        throw new Error('No zscore_params in model response')
      }

      this.zscoreParams = data.zscore_params
      this.modelVersion = data.version
      
      // Set params in normalizer
      zScoreNormalizer.setParams(this.zscoreParams)

      return this.zscoreParams
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load Z-score params'
      throw err
    }
  }

  /**
   * Get cached Z-score params
   */
  getZScoreParams(): ZScoreParams | null {
    return this.zscoreParams
  }

  /**
   * Ensure TensorFlow.js is loaded (lazy load on first use)
   */
  private async ensureTf(): Promise<TfNamespace> {
    if (!this.tf) {
      this.tf = await import('@tensorflow/tfjs')
      await this.tf.ready()
    }
    return this.tf
  }

  /**
   * Load TensorFlow.js model from URL
   */
  async loadModel(modelPath?: string): Promise<void> {
    if (this.status === 'loading') {
      return
    }

    this.status = 'loading'
    this.error = null

    try {
      // Dispose existing model if any
      await this.disposeModel()

      // Lazy-load TensorFlow.js
      const tf = await this.ensureTf()

      const path = modelPath || this.modelPath

      // Load model from URL
      this.model = await tf.loadLayersModel(path)
      
      // Warm up the model with a dummy input
      await this.warmUp(tf)

      this.status = 'ready'
      this.lastUsed = Date.now()

      // Schedule automatic disposal
      this.scheduleDisposal()

    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : 'Failed to load model'
      throw err
    }
  }

  /**
   * Warm up model by running inference with dummy data
   */
  private async warmUp(tf: TfNamespace): Promise<void> {
    if (!this.model) return

    try {
      // Create dummy input matching expected shape
      const dummyInput = tf.zeros([1, 60, 18])
      const dummyOutput = this.model.predict(dummyInput)
      
      // Clean up tensors
      if (Array.isArray(dummyOutput)) {
        dummyOutput.forEach(t => t.dispose())
      } else {
        dummyOutput?.dispose()
      }
      dummyInput.dispose()
    } catch (err) {
      console.warn('Model warm-up failed:', err)
    }
  }

  /**
   * Run prediction on feature vector
   */
  async predict(features: number[]): Promise<PredictionResult> {
    // Ensure model is loaded
    if (!this.isReady()) {
      await this.loadModel()
    }

    if (!this.model) {
      throw new Error('Model not loaded')
    }

    // Reset inactivity timer
    this.lastUsed = Date.now()
    this.scheduleDisposal()

    try {
      // Get tf namespace
      const tf = await this.ensureTf()

      // Input shape: [batch=1, timesteps=60, features=18]
      const timesteps = 60
      const numFeatures = 18
      
      // Ensure features has exactly numFeatures elements
      const featureVector: number[] = features.slice(0, numFeatures)
      while (featureVector.length < numFeatures) {
        featureVector.push(0)
      }
      
      // Create 3D tensor: each timestep gets the same feature vector
      const inputData: number[][][] = []
      for (let t = 0; t < timesteps; t++) {
        inputData.push([[...featureVector]])
      }
      
      const inputTensor = tf.tensor3d(inputData, [1, timesteps, numFeatures], 'float32')
      
      // Run inference
      const output = this.model.predict(inputTensor) as tf.Tensor
      
      let probability: number
      if (typeof output.dataSync === 'function') {
        const data = output.dataSync()
        probability = data[0]
      } else {
        probability = 0.5
      }

      // Clean up tensors
      inputTensor.dispose()
      output.dispose()

      // Determine direction based on probability
      let direction: 'UP' | 'DOWN' | 'NEUTRAL'
      if (probability > 0.55) {
        direction = 'UP'
      } else if (probability < 0.45) {
        direction = 'DOWN'
      } else {
        direction = 'NEUTRAL'
      }

      // Calculate confidence (distance from 0.5)
      const confidence = Math.abs(probability - 0.5) * 2

      return {
        direction,
        confidence,
        rawProbability: probability,
        modelVersion: this.modelVersion || 'unknown',
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Prediction failed'
      throw err
    }
  }

  /**
   * Predict using price data directly
   */
  async predictFromPrices(prices: import('@/types').Price[]): Promise<PredictionResult> {
    // Ensure Z-score params are loaded
    if (!this.zscoreParams) {
      await this.loadZScoreParams()
    }

    if (!this.zscoreParams) {
      throw new Error('Z-score parameters not available')
    }

    // Extract and normalize features
    const features = featureExtractor.prepareForModel(prices, this.zscoreParams)

    // Run prediction
    return this.predict(features)
  }

  /**
   * Schedule model disposal after inactivity
   */
  private scheduleDisposal(): void {
    if (this.disposalTimer) {
      clearTimeout(this.disposalTimer)
    }

    this.disposalTimer = setTimeout(async () => {
      const timeSinceLastUse = Date.now() - this.lastUsed
      if (timeSinceLastUse >= this.cacheTTL) {
        await this.disposeModel()
      }
    }, this.cacheTTL)
  }

  /**
   * Dispose of the model and clean up memory
   */
  async disposeModel(): Promise<void> {
    if (this.disposalTimer) {
      clearTimeout(this.disposalTimer)
      this.disposalTimer = null
    }

    if (this.model) {
      this.model.dispose()
      this.model = null
    }

    // Clean up tf namespace to free memory
    if (this.tf) {
      try {
        await this.tf.nextFrame()
      } catch {
        // ignore
      }
      this.tf = null
    }
    
    this.status = 'idle'
  }

  /**
   * Full cleanup - dispose model and reset state
   */
  dispose(): void {
    this.disposeModel()
    this.zscoreParams = null
    this.modelVersion = ''
    this.error = null
    this.status = 'idle'
  }
}

// Export singleton instance
export const modelService = new ModelService()
