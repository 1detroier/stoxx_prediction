import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Type helper for database tables
export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          ticker: string
          name: string
          exchange: string
          sector: string
          country: string
          is_distressed: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      prices: {
        Row: {
          id: number
          ticker: string
          date: string
          open: number | null
          high: number | null
          low: number | null
          close: number | null
          adjusted_close: number | null
          volume: number | null
        }
        Insert: Omit<Database['public']['Tables']['prices']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['prices']['Insert']>
      }
      models: {
        Row: {
          id: string
          version: string
          is_stable: boolean
          training_date: string | null
          git_commit_hash: string | null
          training_accuracy: number | null
          distressed_accuracy: number | null
          zscore_params: Record<string, { mean: number; std: number }> | null
          features_hash: string | null
          storage_path: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['models']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['models']['Insert']>
      }
      predictions: {
        Row: {
          id: number
          ticker: string
          model_version: string
          predicted_at: string
          prediction_window_days: number
          predicted_direction: boolean
          confidence: number | null
          actual_direction: boolean | null
          was_correct: boolean | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['predictions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['predictions']['Insert']>
      }
    }
  }
}
