#!/usr/bin/env python3
"""
Quick hyperparameter search for the LSTM training pipeline.

Uses a reduced ticker subset and shorter history window to evaluate
candidate configs quickly with walk-forward (time-aware) validation.
"""

import argparse
import csv
import datetime
import itertools
import json
import logging
import os
import random
from pathlib import Path
from typing import Any

import numpy as np

from feature_engineer import (
    TICKERS,
    PANEL_FEATURES,
    load_csv,
    create_features,
    calculate_zscore,
    create_panel_tensor,
)
from train_lstm import time_series_split, train_and_evaluate, set_global_seed


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def build_reduced_feature_frames(
    input_dir: str,
    ticker_count: int,
    years: int,
    seed: int
) -> tuple[list[str], list[Any]]:
    """Build feature frames for a deterministic ticker subset."""
    rng = random.Random(seed)
    sample_size = min(max(ticker_count, 1), len(TICKERS))
    selected_tickers = rng.sample(TICKERS, sample_size)

    logger.info("Loading and engineering features for ticker subset...")
    logger.info(f"Selected tickers ({len(selected_tickers)}): {selected_tickers}")

    return_features = ['return_1d', 'return_1m', 'return_6m', 'return_9m']
    zscore_params: dict[str, Any] = {}

    feature_frames = []
    loaded_tickers = []

    for ticker in selected_tickers:
        df = load_csv(ticker, input_dir, years=years)
        if df is None:
            continue

        df_feat = create_features(df)
        if not zscore_params:
            df_feat, zscore_params = calculate_zscore(df_feat, return_features, is_train=True)
        else:
            df_feat, _ = calculate_zscore(
                df_feat,
                return_features,
                is_train=False,
                params=zscore_params
            )

        feature_frames.append(df_feat)
        loaded_tickers.append(ticker)

    if not feature_frames:
        raise ValueError("No ticker data could be loaded for quick tuning.")

    return loaded_tickers, feature_frames


def aggregate_metrics(metrics_list: list[dict[str, Any]]) -> dict[str, float]:
    """Aggregate fold metrics by mean."""
    keys = [
        'balanced_accuracy_optimal',
        'val_accuracy',
        'precision',
        'recall',
        'f1',
        'auc',
        'optimal_threshold',
    ]
    out: dict[str, float] = {}
    for key in keys:
        values = [float(m.get(key, 0.0)) for m in metrics_list]
        out[key] = float(np.mean(values)) if values else 0.0
    return out


def run_trial(
    trial_id: int,
    trial_cfg: dict[str, Any],
    feature_frames: list[Any],
    tickers: list[str],
    epochs: int,
    seed: int
) -> dict[str, Any]:
    """Train/evaluate one trial config with walk-forward validation."""
    lookback = int(trial_cfg['lookback'])
    X, y, _ = create_panel_tensor(
        feature_frames,
        tickers,
        timesteps=lookback,
        features=PANEL_FEATURES
    )

    if len(X) < 80:
        return {
            'trial': trial_id,
            'status': 'skipped',
            'reason': f'Not enough samples ({len(X)}) for stable walk-forward evaluation',
            'params': trial_cfg,
        }

    splits = list(time_series_split(X, y, n_splits=3))
    if len(splits) == 0:
        return {
            'trial': trial_id,
            'status': 'skipped',
            'reason': 'No valid walk-forward folds were produced',
            'params': trial_cfg,
        }

    fold_metrics: list[dict[str, Any]] = []
    for fold_idx, (X_train, X_val, y_train, y_val) in enumerate(splits, start=1):
        fold_seed = seed + trial_id * 100 + fold_idx
        model, _, metrics = train_and_evaluate(
            X_train,
            y_train,
            X_val,
            y_val,
            use_focal_loss=bool(trial_cfg['use_focal_loss']),
            focal_alpha=float(trial_cfg['focal_alpha']),
            epochs=epochs,
            batch_size=64,
            early_stopping_patience=min(3, max(1, epochs // 2)),
            learning_rate=float(trial_cfg['learning_rate']),
            lstm_units=list(trial_cfg['lstm_units']),
            dropout=float(trial_cfg['dropout']),
            threshold_candidates=list(trial_cfg['threshold_candidates']),
            seed=fold_seed,
            shuffle=False,
            verbose=0,
        )

        if model is None or not metrics:
            return {
                'trial': trial_id,
                'status': 'failed',
                'reason': f'Training failed at fold {fold_idx}',
                'params': trial_cfg,
            }

        fold_metrics.append(metrics)

    aggregated = aggregate_metrics(fold_metrics)
    return {
        'trial': trial_id,
        'status': 'ok',
        'params': trial_cfg,
        'n_samples': int(len(X)),
        'n_folds': int(len(splits)),
        'metrics': aggregated,
    }


def save_results(output_path: str, payload: dict[str, Any]) -> None:
    """Save full results as JSON or CSV based on output extension."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.suffix.lower() == '.csv':
        rows = []
        for result in payload['results']:
            row = {
                'trial': result.get('trial'),
                'status': result.get('status'),
                'reason': result.get('reason', ''),
                'n_samples': result.get('n_samples', 0),
            }
            params = result.get('params', {})
            metrics = result.get('metrics', {})
            row.update({
                'learning_rate': params.get('learning_rate'),
                'dropout': params.get('dropout'),
                'lstm_units': params.get('lstm_units'),
                'lookback': params.get('lookback'),
                'use_focal_loss': params.get('use_focal_loss'),
                'focal_alpha': params.get('focal_alpha'),
                'threshold_candidates': params.get('threshold_candidates'),
                'balanced_accuracy': metrics.get('balanced_accuracy_optimal'),
                'precision': metrics.get('precision'),
                'recall': metrics.get('recall'),
                'f1': metrics.get('f1'),
                'val_accuracy': metrics.get('val_accuracy'),
            })
            rows.append(row)

        fieldnames = list(rows[0].keys()) if rows else ['trial', 'status']
        with output.open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return

    with output.open('w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Quick hyperparameter search for train_lstm using reduced data.'
    )
    parser.add_argument('--input', type=str, default='../data/raw', help='Raw CSV input directory')
    parser.add_argument('--tickers', type=int, default=8, help='Number of tickers to sample')
    parser.add_argument('--years', type=int, default=3, help='History window in years')
    parser.add_argument('--trials', type=int, default=12, help='Number of trials to run')
    parser.add_argument('--epochs', type=int, default=6, help='Epochs per trial fold')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    parser.add_argument('--output', type=str, default='./quick_tune_results.json', help='Output JSON/CSV path')
    parser.add_argument('--top-n', type=int, default=5, help='How many top configs to print')
    args = parser.parse_args()

    set_global_seed(args.seed)

    tickers, feature_frames = build_reduced_feature_frames(
        input_dir=args.input,
        ticker_count=args.tickers,
        years=args.years,
        seed=args.seed,
    )

    learning_rates = [3e-4, 5e-4, 1e-3]
    dropouts = [0.2, 0.3, 0.4]
    lstm_units_space = [(64, 32), (96, 48), (128, 64)]
    lookbacks = [30, 45, 60]
    focal_modes = [True, False]
    focal_alphas = [0.25, 0.5, 0.75]
    threshold_spaces = [
        [0.45, 0.50, 0.55],
        [0.40, 0.50, 0.60],
        [0.35, 0.45, 0.55, 0.65],
    ]

    full_space = list(itertools.product(
        learning_rates,
        dropouts,
        lstm_units_space,
        lookbacks,
        focal_modes,
        focal_alphas,
        threshold_spaces,
    ))

    rng = random.Random(args.seed)
    trial_count = min(max(1, args.trials), len(full_space))
    sampled_configs = rng.sample(full_space, trial_count)

    logger.info(f"Running {trial_count} trials with {len(tickers)} tickers and {args.years} years...")

    results = []
    for idx, sampled in enumerate(sampled_configs, start=1):
        trial_cfg = {
            'learning_rate': sampled[0],
            'dropout': sampled[1],
            'lstm_units': sampled[2],
            'lookback': sampled[3],
            'use_focal_loss': sampled[4],
            'focal_alpha': sampled[5],
            'threshold_candidates': sampled[6],
        }

        logger.info(
            f"Trial {idx}/{trial_count}: lr={trial_cfg['learning_rate']}, "
            f"dropout={trial_cfg['dropout']}, units={trial_cfg['lstm_units']}, "
            f"lookback={trial_cfg['lookback']}, focal={trial_cfg['use_focal_loss']}, "
            f"alpha={trial_cfg['focal_alpha']}"
        )
        result = run_trial(
            trial_id=idx,
            trial_cfg=trial_cfg,
            feature_frames=feature_frames,
            tickers=tickers,
            epochs=args.epochs,
            seed=args.seed,
        )
        results.append(result)

    successful = [r for r in results if r.get('status') == 'ok']
    successful_sorted = sorted(
        successful,
        key=lambda r: (
            -float(r['metrics']['balanced_accuracy_optimal']),
            -float(r['metrics']['f1']),
            -float(r['metrics']['precision']),
            -float(r['metrics']['recall']),
        )
    )

    top_n = max(1, min(args.top_n, len(successful_sorted))) if successful_sorted else 0
    logger.info('')
    logger.info('=' * 72)
    logger.info(f'TOP {top_n} CONFIGS (ranked by balanced accuracy)')
    logger.info('=' * 72)

    for rank, result in enumerate(successful_sorted[:top_n], start=1):
        params = result['params']
        metrics = result['metrics']
        logger.info(
            f"#{rank} trial={result['trial']} | bal_acc={metrics['balanced_accuracy_optimal']:.4f} "
            f"f1={metrics['f1']:.4f} prec={metrics['precision']:.4f} rec={metrics['recall']:.4f} | "
            f"lr={params['learning_rate']} drop={params['dropout']} "
            f"units={params['lstm_units']} lookback={params['lookback']} "
            f"focal={params['use_focal_loss']} alpha={params['focal_alpha']}"
        )

    payload = {
        'created_at': datetime.datetime.utcnow().isoformat() + 'Z',
        'seed': args.seed,
        'input_dir': os.path.abspath(args.input),
        'selected_tickers': tickers,
        'years': args.years,
        'trials': trial_count,
        'epochs': args.epochs,
        'results': results,
        'top_configs': successful_sorted[:top_n],
    }
    save_results(args.output, payload)

    logger.info('-' * 72)
    logger.info(f"Completed: {len(successful)} successful / {len(results)} total trials")
    logger.info(f"Saved full results to: {args.output}")


if __name__ == '__main__':
    main()
