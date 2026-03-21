# ML Training Configuration

## Overview

This document describes the training configuration for the LSTM stock prediction model.

## Data Configuration

| Parameter | Value | Rationale |
|-----------|-------|------------|
| Historical period | 7 years | Covers most market cycles (bull, bear, COVID, rate changes) |
| Number of companies | 45 | European STOXX 600 companies |
| Data type | End-of-day (daily close) | Less noise than intraday; industry standard |
| Price adjustment | Adjusted close | Accounts for splits and dividends |

**Why 7 years?**
- Model accuracy plateaus early (epoch 20-30)
- Extra data (10 years) doesn't improve accuracy
- 7 years provides good coverage without slowing training
- Covers: bull market 2017, bear market 2018, COVID crash 2020, rate hikes 2022-2023

## Model Architecture

```
Input (30 timesteps × 17 features)
    ↓
Bidirectional LSTM (64 units × 2 directions)
    ↓
Dropout (0.2)
    ↓
LSTM (32 units)
    ↓
Dropout (0.2)
    ↓
Dense (32 units, relu)
    ↓
Output (1 unit, sigmoid)
```

**Why Bidirectional LSTM?**
- Captures forward AND backward patterns
- Better than unidirectional for time series
- Still fast enough for this use case

## Training Configuration

| Parameter | Value | Rationale |
|-----------|-------|------------|
| Walk-forward folds | 4 | Robust accuracy estimate |
| Max epochs | 50 | Early stopping handles early stops |
| Early stopping patience | 15 | Stop if val_loss doesn't improve |
| Batch size | 64 | Balance between speed and gradient quality |
| Prediction horizon | 10 days | Less noisy than 3-day; more predictable |
| Lookback window | 30 days | Optimal from quick_tune |
| Learning rate | 0.0005 | Optimal from quick_tune |
| Dropout | 0.2 | Optimal from quick_tune |

## Loss Function

**Binary Crossentropy** (no focal loss)
- Optimal from quick_tune - focal loss did not improve results
- Simple and effective for binary classification

**Class Weights** (automatic)
- Inverse frequency weighting
- Handles ~55% positive / ~45% negative imbalance

## Threshold Optimization

**Candidates**: [0.45, 0.5, 0.55]
- Optimal threshold found: ~0.50
- Selected to maximize balanced accuracy

## Expected Performance

| Metric | Expected | Explanation |
|--------|----------|-------------|
| Balanced accuracy | ~53-55% | Normal for stock prediction |
| Val accuracy | ~55-56% | Raw accuracy on validation |
| Optimal threshold | ~0.50 | Optimized from quick_tune |
| Early stopping | ~epoch 30 | Accuracy plateaus early |

**Why ~55% accuracy is normal:**
- Stock returns are approximately random walk
- 10-day prediction is easier than daily, harder than monthly
- To reach 70%+ would require: monthly prediction, different features, or ensemble methods

## Time Estimate

| Data | Samples | Time (4 folds) |
|------|---------|----------------|
| 10 years | 56,000 | ~12 hours |
| 7 years | 39,000 | ~4 hours |
| 5 years | 28,000 | ~2 hours |

**Current configuration: ~4 hours**

## Commands

```bash
# 1. Re-process features (required after config changes)
cd STOXX-stocks/training
python feature_engineer.py --input ../data/raw --output ../data/processed

# 2. Quick tune on reduced subset (fast search)
python quick_tune.py --tickers 8 --years 3 --trials 12 --epochs 6 --seed 42 --output ./quick_tune_results.json

# 3. Train model
python train_lstm.py --input ../data/processed --output ../models

# 4. Convert to TF.js (Node.js)
cd ..
npm run convert-model

# 5. Build and deploy
npm run build
```

### Quick Tuning Notes

- Uses walk-forward validation only (no random KFold)
- Designed for short runs on reduced ticker/year subsets
- Ranks configs by balanced accuracy, then F1/precision/recall
- Save output as `.json` or `.csv` by changing `--output` extension

## Changelog

### 2026-03-20 - Optimal Parameters from quick_tune
- **learning_rate**: 0.0005 (from 0.001) - optimal from quick_tune trial 5
- **dropout**: 0.2 (from 0.3) - optimal from quick_tune trial 5
- **lstm_units**: [64, 32] (from [128, 64]) - optimal from quick_tune trial 5
- **lookback**: 30 (from 60) - optimal from quick_tune trial 5
- **use_focal_loss**: False (from True) - optimal from quick_tune
- **threshold_candidates**: [0.45, 0.5, 0.55] - optimal from quick_tune trial 5
- **batch_size**: 64 (from 128) - adjusted for smaller lookback

**Quick tune results** (trial 5, top config):
- balanced_accuracy_optimal: 0.534
- val_accuracy: 0.556
- precision: 0.613, recall: 0.757, f1: 0.668

### 2026-03-19 - Optimized Training Configuration
- Changed from 10 years to 7 years of data
- Reduced folds from 5 to 4
- Set max epochs to 50 (was 150)
- Changed prediction horizon from 3 days to 10 days
- Added focal loss instead of binary crossentropy
- Simplified to bidirectional LSTM (removed attention)
- Changed export from TF.js to Keras (Node.js handles conversion)

**Rationale:** Model accuracy plateaus early regardless of data amount. Reducing data and epochs significantly speeds up training without hurting accuracy.
