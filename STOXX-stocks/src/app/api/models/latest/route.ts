import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { modelsRepository } from '@/lib/repositories/ModelsRepository'

// Load local metadata as fallback (always matches deployed TFJS files)
const METADATA_PATH = path.resolve(process.cwd(), 'public/models/metadata.json')

// Cache control header (1 hour - model versions don't change often)
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=600'

function loadLocalMetadata() {
  try {
    const raw = fs.readFileSync(METADATA_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * GET /api/models/latest
 * Fetch the latest stable model with its parameters.
 *
 * Falls back to local metadata.json when Supabase is unavailable
 * or has no stable model — ensures the frontend always gets params
 * that match the deployed TFJS model.
 */
export async function GET() {
  // Try Supabase first
  try {
    const model = await modelsRepository.getLatestStable()

    if (model) {
      const response = {
        version: model.version,
        training_date: model.training_date,
        training_accuracy: model.training_accuracy,
        balanced_accuracy: null,
        distressed_accuracy: model.distressed_accuracy,
        optimal_threshold: null,
        zscore_params: model.zscore_params,
        features_hash: model.features_hash,
        git_commit_hash: model.git_commit_hash,
        storage_path: model.storage_path,
      }

      return NextResponse.json(response, {
        headers: { 'Cache-Control': CACHE_CONTROL },
      })
    }
  } catch (error) {
    console.warn('Supabase model fetch failed, using local metadata:', error)
  }

  // Fallback: serve from local metadata.json (always in sync with TFJS files)
  const meta = loadLocalMetadata()
  if (meta) {
    const response = {
      version: meta.model_version,
      training_date: meta.training_date,
      training_accuracy: meta.accuracy,
      balanced_accuracy: meta.balanced_accuracy,
      distressed_accuracy: meta.distressed_accuracy,
      optimal_threshold: meta.optimal_threshold,
      zscore_params: meta.zscore_params,
      features_hash: meta.features_hash,
      git_commit_hash: meta.git_commit,
      storage_path: meta.model_path,
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    })
  }

  return NextResponse.json(
    { error: 'No model metadata available' },
    { status: 503 }
  )
}
