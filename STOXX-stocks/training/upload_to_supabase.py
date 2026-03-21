#!/usr/bin/env python3
"""
Phase 5.4: Upload to Supabase for STOXX-stocks Training Pipeline

Uploads trained model artifacts and metadata to Supabase Storage and Database.
Cleans up local raw data files after successful upload.

Usage:
    python upload_to_supabase.py --model-dir ../public/models
    python upload_to_supabase.py --model-dir ../public/models --cleanup

Environment Variables:
    SUPABASE_URL: Supabase project URL (required)
    SUPABASE_SERVICE_ROLE_KEY: Supabase service role key (required)
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constants
MODEL_DIR = "../public/models"
DATA_DIR = "../data"
RAW_DIR = "../data/raw"
PROCESSED_DIR = "../data/processed"


def get_supabase_credentials() -> tuple:
    """
    Get Supabase credentials from environment variables.
    
    Returns:
        Tuple of (url, service_role_key)
        
    Raises:
        ValueError: If credentials are not set
    """
    url = os.environ.get('SUPABASE_URL', '')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    
    if not url:
        raise ValueError(
            "SUPABASE_URL environment variable is not set. "
            "Please set it in your .env file or environment."
        )
    
    if not key:
        raise ValueError(
            "SUPABASE_SERVICE_ROLE_KEY environment variable is not set. "
            "Please set it in your .env file or environment."
        )
    
    return url, key


def get_supabase_client():
    """
    Get Supabase client instance.
    
    Returns:
        Supabase client or None if not available
    """
    try:
        from supabase import create_client, Client
        url, key = get_supabase_credentials()
        client: Client = create_client(url, key)
        return client
    except ImportError:
        logger.error("Supabase Python client not installed. Install with: pip install supabase")
        return None
    except ValueError as e:
        logger.error(str(e))
        return None


def upload_model_artifacts(
    client,
    model_dir: str,
    bucket: str = "models"
) -> Optional[str]:
    """
    Upload model files to Supabase Storage.
    
    Args:
        client: Supabase client
        model_dir: Directory containing model files
        bucket: Storage bucket name
        
    Returns:
        Storage path prefix or None on failure
    """
    if client is None:
        logger.error("Supabase client not available")
        return None
    
    model_path = Path(model_dir)
    
    if not model_path.exists():
        logger.error(f"Model directory not found: {model_dir}")
        return None
    
    # Load metadata
    metadata_path = model_path / 'metadata.json'
    if not metadata_path.exists():
        logger.error(f"Metadata file not found: {metadata_path}")
        return None
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    version = metadata.get('model_version', 'v1.0.0')
    storage_path = f"models/{version}"
    
    try:
        # Ensure bucket exists
        try:
            client.storage.get_bucket(bucket)
        except Exception:
            logger.info(f"Creating bucket: {bucket}")
            client.storage.create_bucket(bucket, {'public': True})
        
        # Upload TensorFlow.js model files
        tfjs_dir = model_path / 'tfjs_model'
        if tfjs_dir.exists():
            for file in tfjs_dir.rglob('*'):
                if file.is_file():
                    relative_path = file.relative_to(tfjs_dir)
                    dest_path = f"{storage_path}/{relative_path}"
                    
                    logger.info(f"Uploading {file} -> {dest_path}")
                    with open(file, 'rb') as f:
                        client.storage.from_(bucket).upload(
                            dest_path,
                            f.read(),
                            {"content-type": "application/octet-stream"}
                        )
        
        # Upload metadata
        metadata_dest = f"{storage_path}/metadata.json"
        with open(metadata_path, 'rb') as f:
            client.storage.from_(bucket).upload(
                metadata_dest,
                f.read(),
                {"content-type": "application/json"}
            )
        
        logger.info(f"Model uploaded to storage: {storage_path}")
        return storage_path
        
    except Exception as e:
        logger.error(f"Failed to upload model artifacts: {e}")
        return None


def insert_model_metadata(
    client,
    metadata: dict,
    storage_path: str
) -> Optional[str]:
    """
    Insert model metadata into Supabase models table.
    
    Args:
        client: Supabase client
        metadata: Model metadata dictionary
        storage_path: Supabase Storage path
        
    Returns:
        Model version string or None on failure
    """
    if client is None:
        logger.error("Supabase client not available")
        return None
    
    version = metadata.get('model_version', 'v1.0.0')
    
    # Prepare record
    record = {
        "version": version,
        "is_stable": False,  # Will be set to True after validation
        "training_date": metadata.get('training_date'),
        "git_commit_hash": metadata.get('git_commit'),
        "training_accuracy": metadata.get('accuracy'),
        "distressed_accuracy": metadata.get('distressed_accuracy'),
        "zscore_params": metadata.get('zscore_params'),
        "features_hash": metadata.get('features_hash'),
        "storage_path": storage_path
    }
    
    try:
        # Insert record
        response = client.table('models').insert(record).execute()
        
        if response.data:
            logger.info(f"Model metadata inserted: {version}")
            return version
        else:
            logger.warning(f"Insert response empty: {response}")
            return version
            
    except Exception as e:
        # Check if it's a duplicate key error
        if 'duplicate key' in str(e).lower() or 'unique constraint' in str(e).lower():
            logger.warning(f"Model version {version} already exists. Updating...")
            try:
                response = client.table('models').update(record).eq('version', version).execute()
                logger.info(f"Model metadata updated: {version}")
                return version
            except Exception as update_error:
                logger.error(f"Failed to update model metadata: {update_error}")
                return None
        else:
            logger.error(f"Failed to insert model metadata: {e}")
            return None


def cleanup_local_files(
    raw_dir: str = RAW_DIR,
    processed_dir: str = PROCESSED_DIR,
    model_dir: str = MODEL_DIR,
    keep_models: bool = True
) -> dict:
    """
    Clean up local data files after successful upload.
    
    Args:
        raw_dir: Raw data directory
        processed_dir: Processed data directory
        model_dir: Model directory
        keep_models: If True, keep model files; if False, delete them too
        
    Returns:
        Dictionary with cleanup statistics
    """
    stats = {
        'files_deleted': 0,
        'bytes_freed': 0,
        'errors': []
    }
    
    # Delete raw CSV files
    raw_path = Path(raw_dir)
    if raw_path.exists():
        for file in raw_path.glob('*.csv'):
            try:
                size = file.stat().st_size
                file.unlink()
                stats['files_deleted'] += 1
                stats['bytes_freed'] += size
                logger.info(f"Deleted: {file}")
            except Exception as e:
                stats['errors'].append(f"Failed to delete {file}: {e}")
    
    # Optionally delete processed files
    processed_path = Path(processed_dir)
    if processed_path.exists():
        for file in processed_path.glob('*'):
            if file.is_file():
                try:
                    size = file.stat().st_size
                    file.unlink()
                    stats['files_deleted'] += 1
                    stats['bytes_freed'] += size
                    logger.info(f"Deleted: {file}")
                except Exception as e:
                    stats['errors'].append(f"Failed to delete {file}: {e}")
    
    # Optionally delete model files
    if not keep_models:
        model_path = Path(model_dir)
        if model_path.exists():
            import shutil
            try:
                size = sum(f.stat().st_size for f in model_path.rglob('*') if f.is_file())
                shutil.rmtree(model_path)
                stats['files_deleted'] += len(list(model_path.rglob('*')))
                stats['bytes_freed'] += size
                logger.info(f"Deleted model directory: {model_path}")
            except Exception as e:
                stats['errors'].append(f"Failed to delete model dir: {e}")
    
    return stats


def upload_all(
    model_dir: str = MODEL_DIR,
    cleanup: bool = True,
    keep_models: bool = True
) -> bool:
    """
    Orchestrate the complete upload process.
    
    Args:
        model_dir: Directory containing model files
        cleanup: If True, clean up local files after upload
        keep_models: If True, keep model files after upload
        
    Returns:
        True if successful, False otherwise
    """
    logger.info("Starting Supabase upload process...")
    
    # Get Supabase client
    client = get_supabase_client()
    if client is None:
        logger.error("Failed to initialize Supabase client")
        return False
    
    # Load metadata
    metadata_path = Path(model_dir) / 'metadata.json'
    if not metadata_path.exists():
        logger.error(f"Metadata not found: {metadata_path}")
        logger.info("Please run train_lstm.py first to generate model artifacts.")
        return False
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    logger.info(f"Model version: {metadata.get('model_version')}")
    logger.info(f"Accuracy: {metadata.get('accuracy', 'N/A')}")
    logger.info(f"Balanced Accuracy: {metadata.get('balanced_accuracy', 'N/A')}")
    
    # Upload model artifacts
    logger.info("Uploading model artifacts...")
    storage_path = upload_model_artifacts(client, model_dir)
    
    if storage_path is None:
        logger.error("Failed to upload model artifacts")
        return False
    
    # Insert metadata
    logger.info("Inserting model metadata...")
    version = insert_model_metadata(client, metadata, storage_path)
    
    if version is None:
        logger.error("Failed to insert model metadata")
        return False
    
    # Cleanup local files if requested
    if cleanup:
        logger.info("Cleaning up local files...")
        stats = cleanup_local_files(keep_models=keep_models)
        logger.info(
            f"Cleanup complete: {stats['files_deleted']} files deleted, "
            f"{stats['bytes_freed'] / 1024 / 1024:.2f} MB freed"
        )
        if stats['errors']:
            logger.warning(f"Cleanup errors: {stats['errors']}")
    
    logger.info(f"\n✅ Upload complete!")
    logger.info(f"Model version: {version}")
    logger.info(f"Storage path: {storage_path}")
    
    return True


def main():
    """Main entry point for Supabase upload."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Upload trained model to Supabase',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python upload_to_supabase.py --model-dir ../public/models
  python upload_to_supabase.py -m ../public/models --cleanup
  python upload_to_supabase.py -m ../public/models --no-cleanup

Environment:
  SUPABASE_URL              Supabase project URL (required)
  SUPABASE_SERVICE_ROLE_KEY Supabase service role key (required)

Note: The service role key provides admin access. Keep it secure and never
      expose it in client-side code.
        """
    )
    
    parser.add_argument(
        '-m', '--model-dir',
        type=str,
        default=MODEL_DIR,
        help=f'Model directory (default: {MODEL_DIR})'
    )
    
    parser.add_argument(
        '-c', '--cleanup',
        action='store_true',
        default=True,
        help='Clean up local data files after upload (default: True)'
    )
    
    parser.add_argument(
        '--no-cleanup',
        action='store_true',
        help='Skip cleanup of local files'
    )
    
    parser.add_argument(
        '-k', '--keep-models',
        action='store_true',
        default=True,
        help='Keep model files after upload (default: True)'
    )
    
    parser.add_argument(
        '--delete-models',
        action='store_true',
        help='Delete model files after upload'
    )
    
    args = parser.parse_args()
    
    # Handle mutually exclusive cleanup options
    do_cleanup = args.cleanup and not args.no_cleanup
    keep_models = not args.delete_models
    
    success = upload_all(
        model_dir=args.model_dir,
        cleanup=do_cleanup,
        keep_models=keep_models
    )
    
    if success:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
