import { getSupabaseAdmin } from './supabase-admin'
import type { Model } from '@/types'

/**
 * Repository for Model-related database operations
 */
export class ModelsRepository {
  /**
   * Get the latest stable model
   */
  async getLatestStable(): Promise<Model | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('models')
      .select('*')
      .eq('is_stable', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error fetching latest stable model:', error)
      throw new Error(`Failed to fetch latest stable model: ${error.message}`)
    }

    return data
  }

  /**
   * Find a model by version
   */
  async findByVersion(version: string): Promise<Model | null> {
    const { data, error } = await getSupabaseAdmin()
      .from('models')
      .select('*')
      .eq('version', version)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error fetching model by version:', error)
      throw new Error(`Failed to fetch model: ${error.message}`)
    }

    return data
  }

  /**
   * Get all models
   */
  async findAll(): Promise<Model[]> {
    const { data, error } = await getSupabaseAdmin()
      .from('models')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching all models:', error)
      throw new Error(`Failed to fetch models: ${error.message}`)
    }

    return data || []
  }

  /**
   * Mark a model as stable
   */
  async setStable(version: string, isStable: boolean = true): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from('models')
      .update({ is_stable: isStable })
      .eq('version', version)

    if (error) {
      console.error('Error updating model stability:', error)
      throw new Error(`Failed to update model: ${error.message}`)
    }
  }
}

// Export singleton instance
export const modelsRepository = new ModelsRepository()
