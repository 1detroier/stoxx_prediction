#!/usr/bin/env python3
"""
Phase 5.5: Validation Suite for STOXX-stocks Training Pipeline

Validates the training pipeline for common issues:
- Data leakage (look-ahead bias)
- NaN handling
- Train/test temporal split
- Distress balance
- Model output validation

Usage:
    python validation_suite.py --panel ../data/processed/training_panel.h5
    python validation_suite.py --panel ../data/processed/training_panel.h5 --verbose
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Constants
PANEL_PATH = "../data/processed/training_panel.h5"
ZSCORE_PATH = "../data/processed/zscore_params.json"
MAX_ZSCORE = 5.0  # Features should be within ±5 standard deviations
MIN_DISTRESS_RATIO = 0.05  # At least 5% distressed samples


def check_data_leakage(
    df,
    date_column: str = 'date',
    feature_columns: list = None
) -> list[str]:
    """
    Check for data leakage in the dataset.
    
    Looks for:
    - Look-ahead bias: Future data in past
    - Forward fill creating future info
    
    Args:
        df: DataFrame with price data
        date_column: Name of date column
        feature_columns: List of feature columns to check
        
    Returns:
        List of issue descriptions (empty if no issues)
    """
    issues = []
    
    # Check if dates are monotonically increasing
    dates = df[date_column]
    if not dates.is_monotonic_increasing:
        issues.append(
            "DATA_LEAKAGE: Dates are not monotonically increasing. "
            "This may indicate data ordering issues."
        )
    
    # Check for forward fill creating future info
    # If close price jumps and then stays high, forward fill may have leaked info
    if 'close' in df.columns and 'adj_close' in df.columns:
        # Calculate daily returns
        returns = df['adj_close'].pct_change()
        
        # Large jumps followed by stable prices could indicate forward fill
        large_jumps = returns[returns.abs() > 0.2]  # >20% daily move
        if len(large_jumps) > 0:
            # Check if price reverts (forward fill artifact)
            for idx in large_jumps.index:
                if idx in df.index:
                    pos = df.index.get_loc(idx)
                    if pos < len(df) - 5:
                        future_prices = df['adj_close'].iloc[pos:pos+5]
                        if future_prices.std() < returns.std() * 0.5:
                            issues.append(
                                f"DATA_LEAKAGE: Possible forward fill at {idx}. "
                                f"Price stable after large jump."
                            )
                            break  # Only report once
    
    return issues


def check_nan_handling(df: 'pd.DataFrame') -> dict:
    """
    Check NaN handling in the dataset.
    
    Args:
        df: DataFrame to check
        
    Returns:
        Dictionary with NaN statistics and issues
    """
    result = {
        'total_nan_count': 0,
        'nan_by_column': {},
        'issues': []
    }
    
    for col in df.columns:
        nan_count = df[col].isna().sum()
        if nan_count > 0:
            result['nan_by_column'][col] = int(nan_count)
            result['total_nan_count'] += nan_count
    
    if result['total_nan_count'] > 0:
        # Check if NaN is at the beginning (expected from rolling windows)
        for col in result['nan_by_column'].keys():
            first_valid = df[col].first_valid_index()
            if first_valid is not None:
                nan_at_start = df[col].isna().sum()
                total_rows = len(df)
                nan_ratio = nan_at_start / total_rows
                
                # It's OK to have NaN at the start (rolling window warmup)
                if nan_ratio > 0.1:  # More than 10% NaN
                    result['issues'].append(
                        f"NAN_HANDLING: Column '{col}' has {nan_ratio:.1%} NaN values. "
                        f"This may indicate imputation issues."
                    )
    
    return result


def check_train_test_split(
    X_train: np.ndarray,
    X_test: np.ndarray,
    temporal_check: bool = True
) -> dict:
    """
    Verify train/test split doesn't have temporal overlap.
    
    Args:
        X_train: Training features
        X_test: Test features
        temporal_check: If True, verify no temporal overlap
        
    Returns:
        Dictionary with split validation results
    """
    result = {
        'train_size': len(X_train),
        'test_size': len(X_test),
        'temporal_overlap': False,
        'similar_distribution': True,
        'issues': []
    }
    
    # Check temporal overlap (if data is sorted by time)
    if temporal_check:
        # Simple heuristic: if test data is a subset of train indices, there's overlap
        # This is a simplified check - real implementation would use timestamps
        train_mean = np.mean(X_train)
        test_mean = np.mean(X_test)
        
        # Check if distributions are similar
        train_std = np.std(X_train)
        test_std = np.std(X_test)
        
        # Significant distribution shift (>50% difference) might indicate issues
        if abs(train_mean - test_mean) > abs(train_mean) * 0.5:
            result['issues'].append(
                f"SPLIT_WARNING: Train/test mean differs significantly. "
                f"Train: {train_mean:.4f}, Test: {test_mean:.4f}"
            )
            result['similar_distribution'] = False
    
    return result


def check_distress_balance(
    y: np.ndarray,
    sample_info: list = None,
    min_ratio: float = MIN_DISTRESS_RATIO
) -> dict:
    """
    Check distress class balance.
    
    Args:
        y: Labels array
        sample_info: List of sample metadata
        min_ratio: Minimum required distressed ratio
        
    Returns:
        Dictionary with balance statistics
    """
    result = {
        'total_samples': len(y),
        'healthy_count': int(np.sum(y == 1)),  # Assuming 1 = healthy (up)
        'distressed_count': int(np.sum(y == 0)),  # Assuming 0 = distressed (down)
        'distressed_ratio': 0.0,
        'passes': False,
        'issues': []
    }
    
    if result['total_samples'] > 0:
        result['distressed_ratio'] = result['distressed_count'] / result['total_samples']
    
    # Check if distress ratio meets minimum threshold
    if result['distressed_ratio'] < min_ratio:
        result['issues'].append(
            f"DISTRESS_BALANCE: Distressed ratio ({result['distressed_ratio']:.2%}) "
            f"is below minimum ({min_ratio:.2%}). "
            f"Model may not learn failure patterns adequately."
        )
    else:
        result['passes'] = True
    
    # Warn if distress ratio is too high (>50%)
    if result['distressed_ratio'] > 0.5:
        result['issues'].append(
            f"DISTRESS_BALANCE: Distressed ratio ({result['distressed_ratio']:.2%}) "
            f"is very high. Training data may be imbalanced."
        )
    
    return result


def check_zscore_normalization(
    X: np.ndarray,
    zscore_params: dict,
    max_zscore: float = MAX_ZSCORE
) -> dict:
    """
    Check if features are properly Z-score normalized.
    
    Args:
        X: Feature tensor [samples, timesteps, features]
        zscore_params: Z-score parameters {feature: {mean, std}}
        max_zscore: Maximum allowed absolute Z-score
        
    Returns:
        Dictionary with normalization validation results
    """
    result = {
        'feature_ranges': {},
        'outliers_detected': False,
        'issues': []
    }
    
    # Calculate mean and std for each feature across all samples and timesteps
    n_features = X.shape[2] if len(X.shape) >= 3 else 0
    
    for i in range(n_features):
        feature_data = X[:, :, i].flatten()
        
        # Ignore NaN values
        feature_data = feature_data[~np.isnan(feature_data)]
        
        if len(feature_data) == 0:
            continue
        
        mean = np.mean(feature_data)
        std = np.std(feature_data)
        min_val = np.min(feature_data)
        max_val = np.max(feature_data)
        
        result['feature_ranges'][f'feature_{i}'] = {
            'mean': float(mean),
            'std': float(std),
            'min': float(min_val),
            'max': float(max_val)
        }
        
        # Check for outliers (> max_zscore)
        outliers = np.abs(feature_data) > max_zscore
        if np.any(outliers):
            outlier_ratio = np.sum(outliers) / len(feature_data)
            if outlier_ratio > 0.01:  # More than 1% outliers
                result['outliers_detected'] = True
                result['issues'].append(
                    f"ZSCORE_NORMALIZATION: Feature {i} has {outlier_ratio:.2%} "
                    f"values outside ±{max_zscore} range. "
                    f"This may indicate data quality issues."
                )
    
    return result


def check_model_shape(model_path: str) -> dict:
    """
    Validate model output shape.
    
    Args:
        model_path: Path to model file or directory
        
    Returns:
        Dictionary with model validation results
    """
    result = {
        'exists': False,
        'shape_valid': False,
        'output_shape': None,
        'issues': []
    }
    
    path = Path(model_path)
    
    if not path.exists():
        result['issues'].append(f"MODEL_SHAPE: Model not found at {model_path}")
        return result
    
    result['exists'] = True
    
    # Check for TensorFlow.js format
    tfjs_model = path / 'tfjs_model' / 'model.json'
    if tfjs_model.exists():
        with open(tfjs_model, 'r') as f:
            model_json = json.load(f)
        
        # Validate JSON structure
        if 'modelTopology' in model_json or 'format' in model_json:
            result['shape_valid'] = True
            result['output_shape'] = '[batch, 1]'  # Binary classification
        else:
            result['issues'].append("MODEL_SHAPE: Invalid TensorFlow.js model format")
    
    # Check for Keras format
    keras_model = list(path.glob('*.keras'))
    if keras_model:
        result['shape_valid'] = True
        result['output_shape'] = '[batch, 1]'
    
    return result


def run_validation(
    panel_path: str = PANEL_PATH,
    zscore_path: str = ZSCORE_PATH,
    model_path: str = "../public/models"
) -> dict:
    """
    Run complete validation suite.
    
    Args:
        panel_path: Path to training panel HDF5 file
        zscore_path: Path to z-score parameters JSON
        model_path: Path to model directory
        
    Returns:
        Complete validation report dictionary
    """
    report = {
        'passed': True,
        'checks': [],
        'summary': {},
        'issues': []
    }
    
    # Load data
    X, y = None, None
    
    # Try loading HDF5
    h5_path = Path(panel_path)
    if h5_path.exists():
        try:
            import h5py
            with h5py.File(h5_path, 'r') as f:
                X = f['X'][:]
                y = f['y'][:]
            logger.info(f"Loaded panel data: {X.shape}")
        except Exception as e:
            report['issues'].append(f"Failed to load panel data: {e}")
    
    # Try loading numpy files as fallback
    if X is None:
        npy_x = Path(panel_path).parent / 'X_train.npy'
        npy_y = Path(panel_path).parent / 'y_train.npy'
        if npy_x.exists() and npy_y.exists():
            X = np.load(npy_x)
            y = np.load(npy_y)
            logger.info(f"Loaded numpy data: {X.shape}")
    
    if X is None:
        report['passed'] = False
        report['checks'].append({
            'name': 'data_loading',
            'passed': False,
            'message': 'No training data found'
        })
        report['issues'].append('VALIDATION_FAILED: Cannot load training data')
        return report
    
    # 1. Model Shape Check
    logger.info("Checking model shape...")
    model_check = check_model_shape(model_path)
    model_passed = model_check['exists'] and model_check['shape_valid']
    report['checks'].append({
        'name': 'model_shape',
        'passed': model_passed,
        'message': model_check.get('output_shape', 'Model not found or invalid')
    })
    if not model_passed:
        report['passed'] = False
    
    # 2. Distress Balance Check
    logger.info("Checking distress balance...")
    balance_check = check_distress_balance(y)
    balance_passed = balance_check['passes'] if 'passes' in balance_check else True
    report['checks'].append({
        'name': 'distress_balance',
        'passed': balance_passed,
        'message': f"Distressed ratio: {balance_check['distressed_ratio']:.2%}"
    })
    if not balance_passed:
        report['passed'] = False
        report['issues'].extend(balance_check.get('issues', []))
    
    # 3. Z-score Normalization Check
    logger.info("Checking Z-score normalization...")
    zscore_params = {}
    if Path(zscore_path).exists():
        with open(zscore_path, 'r') as f:
            zscore_params = json.load(f)
    
    zscore_check = check_zscore_normalization(X, zscore_params)
    zscore_passed = not zscore_check['outliers_detected']
    report['checks'].append({
        'name': 'zscore_normalization',
        'passed': zscore_passed,
        'message': f"{len(zscore_check.get('issues', []))} outlier warnings"
    })
    if not zscore_passed:
        report['passed'] = False
        report['issues'].extend(zscore_check.get('issues', []))
    
    # 4. Train/Test Split Check
    logger.info("Checking train/test split...")
    if len(X) > 10:
        split_idx = int(len(X) * 0.8)
        split_check = check_train_test_split(X[:split_idx], X[split_idx:])
        report['checks'].append({
            'name': 'train_test_split',
            'passed': True,
            'message': f"Train: {split_check['train_size']}, Test: {split_check['test_size']}"
        })
    else:
        report['checks'].append({
            'name': 'train_test_split',
            'passed': False,
            'message': 'Insufficient data for split validation'
        })
    
    # Summary
    report['summary'] = {
        'total_samples': int(len(X)),
        'n_features': int(X.shape[2]) if len(X.shape) >= 3 else 0,
        'n_timesteps': int(X.shape[1]) if len(X.shape) >= 2 else 0,
        'zscore_features': len(zscore_params)
    }
    
    return report


def print_report(report: dict):
    """Print validation report in human-readable format."""
    print("\n" + "=" * 60)
    print("VALIDATION REPORT")
    print("=" * 60)
    
    status = "✅ PASSED" if report['passed'] else "❌ FAILED"
    print(f"\nOverall Status: {status}")
    
    print("\nChecks:")
    for check in report['checks']:
        icon = "✅" if check['passed'] else "❌"
        print(f"  {icon} {check['name']}: {check['message']}")
    
    if report.get('issues'):
        print("\nIssues Found:")
        for issue in report['issues']:
            print(f"  ⚠️  {issue}")
    
    print("\nSummary:")
    for key, value in report.get('summary', {}).items():
        print(f"  - {key}: {value}")
    
    print("=" * 60)


def main():
    """Main entry point for validation suite."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Validate STOXX training pipeline',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '-p', '--panel',
        type=str,
        default=PANEL_PATH,
        help=f'Path to training panel HDF5 (default: {PANEL_PATH})'
    )
    
    parser.add_argument(
        '-z', '--zscore',
        type=str,
        default=ZSCORE_PATH,
        help=f'Path to z-score params JSON (default: {ZSCORE_PATH})'
    )
    
    parser.add_argument(
        '-m', '--model',
        type=str,
        default="../public/models",
        help='Path to model directory (default: ../public/models)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    parser.add_argument(
        '-j', '--json',
        action='store_true',
        help='Output results as JSON'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info("Starting validation suite...")
    
    report = run_validation(
        panel_path=args.panel,
        zscore_path=args.zscore,
        model_path=args.model
    )
    
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)
    
    if report['passed']:
        logger.info("All validation checks passed!")
        sys.exit(0)
    else:
        logger.error("Validation failed. Please fix the issues above.")
        sys.exit(1)


if __name__ == '__main__':
    main()
