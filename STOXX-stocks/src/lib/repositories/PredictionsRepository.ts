import { getSupabaseAdmin } from './supabase-admin'
import type { Prediction } from '@/types'

export interface CreatePredictionInput {
  ticker: string
  model_version: string
  predicted_direction: boolean
  confidence?: number | null
  prediction_window_days?: number
}

/**
 * Repository for Prediction-related database operations
 */
export class PredictionsRepository {
  /**
   * Create a new prediction
   */
  async create(data: CreatePredictionInput): Promise<Prediction> {
    const { ticker, model_version, predicted_direction, confidence, prediction_window_days = 3 } = data

    const { data: result, error } = await getSupabaseAdmin()
      .from('predictions')
      .insert({
        ticker,
        model_version,
        predicted_direction,
        confidence,
        prediction_window_days,
        predicted_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating prediction:', error)
      throw new Error(`Failed to create prediction: ${error.message}`)
    }

    return result
  }

  /**
   * Find predictions for a ticker
   */
  async findByTicker(ticker: string, days?: number): Promise<Prediction[]> {
    let query = getSupabaseAdmin()
      .from('predictions')
      .select('*')
      .eq('ticker', ticker)
      .order('predicted_at', { ascending: false })

    if (days) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      query = query.gte('predicted_at', cutoffDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching predictions:', error)
      throw new Error(`Failed to fetch predictions: ${error.message}`)
    }

    return data || []
  }

  /**
   * Find the latest prediction for a ticker
   */
  async getLatestForTicker(ticker: string): Promise<Prediction | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('predictions')
      .select('*')
      .eq('ticker', ticker)
      .order('predicted_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error fetching latest prediction:', error)
      throw new Error(`Failed to fetch latest prediction: ${error.message}`)
    }

    return data
  }

  /**
   * Update prediction with actual outcome
   */
  async updateOutcome(
    id: number,
    actual_direction: boolean,
    was_correct: boolean
  ): Promise<Prediction> {
    const { data, error } = await getSupabaseAdmin()
      .from('predictions')
      .update({ actual_direction, was_correct })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating prediction outcome:', error)
      throw new Error(`Failed to update prediction outcome: ${error.message}`)
    }

    return data
  }

  /**
   * Get prediction accuracy for a model version
   */
  async getAccuracyByModel(model_version: string): Promise<{
    total: number
    correct: number
    accuracy: number
  }> {
    const { data, error } = await getSupabaseAdmin()
      .from('predictions')
      .select('was_correct')
      .eq('model_version', model_version)
      .not('was_correct', 'is', null)

    if (error) {
      console.error('Error calculating model accuracy:', error)
      throw new Error(`Failed to calculate accuracy: ${error.message}`)
    }

    const predictions = data || []
    const total = predictions.length
    const correct = predictions.filter((p) => p.was_correct).length
    const accuracy = total > 0 ? correct / total : 0

    return { total, correct, accuracy }
  }
}

// Export singleton instance
export const predictionsRepository = new PredictionsRepository()
