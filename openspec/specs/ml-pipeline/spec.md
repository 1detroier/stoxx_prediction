# ML Pipeline Specification

## Purpose

Define Python scripts for local ML training pipeline: data fetching, feature engineering, LSTM training, model upload, and validation.

## Requirements

### Requirement: Phase A - Data Fetcher (scripts/data_fetcher.py)

The system MUST fetch historical price data from Alpha Vantage with rate limiting.

**Functionality:**
- Fetch daily time series for all 45 tickers
- Rate limit: 2.4 seconds between requests (25 req/min limit with buffer)
- Store raw JSON responses temporarily
- Handle API errors with retry logic (3 attempts, exponential backoff)

**Command:**
```bash
python scripts/data_fetcher.py --output data/raw/
```

**Output:** Raw JSON files per ticker in data/raw/

#### Scenario: Fetch All Tickers

- GIVEN Alpha Vantage API key is configured
- WHEN data_fetcher.py runs for 45 tickers
- THEN requests SHALL be spaced 2.4s apart
- AND raw JSON SHALL be saved to data/raw/{ticker}.json
- AND errors SHALL be logged but not halt execution

### Requirement: Phase B - Feature Engineer (scripts/feature_engineer.py)

The system MUST compute Z-score normalized features from raw prices.

**Data Configuration:**
- Historical data: Last 7 years (balances coverage vs training speed)
- 45 STOXX 600 European companies
- End-of-day adjusted closing prices

**Features (17 total):**
| Category | Features |
|----------|----------|
| Log Returns | return_1d, return_1m, return_6m, return_9m |
| Z-scored Returns | z_return_1d, z_return_1m, z_return_6m, z_return_9m |
| Volatility | volatility_20d, atr_ratio, volume_ratio |
| Momentum | rsi_14, macd, macd_signal, macd_hist |
| European | eur_strength, cross_border, ecb_policy_phase |

**Normalization:**
- Z-score: (value - mean) / std
- Calculate mean/std from training period only
- Store zscore_params (mean, std, feature_order) for inference

**Data Type:**
- End-of-day (daily close) prices - NOT intraday
- Adjusted for splits and dividends
- Uses `adjusted_close` from data source

#### Scenario: Engineer Features

- GIVEN raw price data in data/raw/
- WHEN feature_engineer.py runs
- THEN features SHALL be computed for last 7 years
- AND zscore_params SHALL be saved to data/processed/zscore_params.json
- AND feature hash SHALL be computed for versioning

### Requirement: Phase C - LSTM Training (scripts/train_lstm.py)

The system MUST train panel LSTM model with walk-forward validation.

**Model Architecture:**
- Input: [batch, timesteps=60, features=17]
- Bidirectional LSTM layer 1: 128 units (forward + backward)
- LSTM layer 2: 64 units
- Dropout: 0.3 (regularization)
- Dense layer: 32 units (relu)
- Output: Dense(1, sigmoid) for binary direction prediction
- Loss: Focal loss (handles class imbalance better than binary crossentropy)
- Optimizer: Adam (lr=0.001, clipnorm=1.0)

**Training Configuration:**
| Parameter | Value | Reason |
|-----------|-------|--------|
| Historical data | 7 years | Covers market cycles |
| Walk-forward folds | 4 | Robust validation estimate |
| Max epochs | 50 | Early stopping handles early stops |
| Early stopping patience | 15 | Stop if no improvement |
| Batch size | 128 | Balance speed vs gradient quality |
| Prediction horizon | 10 days | Less noisy than daily |

**Target Variable:**
- Direction: 1 if price_UP in 10 days, 0 if price_DOWN
- Log returns used for better statistical properties

**Class Imbalance Handling:**
- Focal loss (gamma=2.0, alpha=0.25)
- Class weights (inverse frequency)
- ~55% positive / ~45% negative (acceptable imbalance)

**Expected Performance:**
- Expected accuracy: ~52-55% for 10-day prediction
- This is normal for stock prediction (vs 50% random)
- Accuracy plateaus early (epoch 20-30) - extra data doesn't help

#### Scenario: Train Model

- GIVEN feature-engineered data exists (last 7 years)
- WHEN train_lstm.py runs
- THEN training SHALL use 4-fold walk-forward validation
- AND early stopping SHALL prevent overfitting
- AND model SHALL be saved as Keras format (distress_predictor.keras)
- AND metadata SHALL include: version, accuracy, threshold, features_hash

**Model Export:**
- Format: Keras (.keras file)
- Conversion: Separate Node.js step using tfjs-converter
- Command: `npm run convert-model` or `npx tensorflowjs_converter`

#### Scenario: Training Time

- 7 years of data: ~39,000 samples (vs 56,000 for 10 years)
- 4 folds × ~30 epochs (early stopping) = ~120 training runs
- Each epoch ~2 minutes (half of 10-year data)
- **Estimated total time: ~4 hours**

This is 2-3x faster than 10-year data, with the same accuracy outcome.

### Requirement: Phase D - Upload to Supabase (scripts/upload_to_supabase.py)

The system MUST upload model artifacts and metadata to Supabase.

**Upload Steps:**
1. Save model files (model.json, weights.bin) to Supabase Storage
2. Insert model metadata into models table
3. Upload processed features to prices table (bulk insert)
4. Delete raw JSON files from data/raw/

**Metadata Required:**
- version: Semantic version (e.g., "1.0.0")
- git_commit_hash: Current git commit
- training_accuracy: Accuracy on training set
- distressed_accuracy: Accuracy on distressed subset
- zscore_params: JSON with mean, std, feature_order
- features_hash: SHA256 of feature data
- storage_path: Supabase Storage path

#### Scenario: Upload Model

- GIVEN trained model exists in models/lstm_v1.0.0/
- WHEN upload_to_supabase.py runs
- THEN model artifacts SHALL upload to Supabase Storage
- AND metadata SHALL insert into models table
- AND raw data files SHALL be deleted
- AND storage_path SHALL be returned

### Requirement: Phase E - Validation Suite (scripts/validation_suite.py)

The system MUST validate model for data leakage and NaN values.

**Validation Checks:**
| Check | Pass Criteria |
|-------|---------------|
| Temporal leakage | Training data ends before validation period |
| NaN check | Zero NaN values in features |
| Feature range | All features within ±5 Z-score |
| Label balance | Distressed labels ≥ 5% of total |
| Model shape | Output shape matches [None, 1] |

**Report Format:**
```json
{
  "passed": true,
  "checks": [
    {"name": "temporal_leakage", "passed": true},
    {"name": "nan_check", "passed": true},
    {"name": "feature_range", "passed": true},
    {"name": "label_balance", "passed": true},
    {"name": "model_shape", "passed": true}
  ]
}
```

#### Scenario: Validation Passes

- GIVEN model training completed
- WHEN validation_suite.py runs
- THEN all checks SHALL pass
- AND is_stable SHALL be set to TRUE in models table

#### Scenario: Validation Fails

- GIVEN NaN values exist in features
- WHEN validation_suite.py runs
- THEN validation SHALL fail
- AND error SHALL be logged with details
- AND is_stable SHALL NOT be set to TRUE

## Directory Structure

```
scripts/
├── data_fetcher.py        # Phase A
├── feature_engineer.py    # Phase B
├── train_lstm.py           # Phase C
├── upload_to_supabase.py   # Phase D
└── validation_suite.py     # Phase E
data/
├── raw/                   # Temporary raw JSON (deleted after processing)
├── features/              # Processed features
└── zscore_params.json     # Normalization parameters
models/
└── lstm_v{version}/       # Model artifacts
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| ALPHA_VANTAGE_API_KEY | Alpha Vantage API key |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_SERVICE_KEY | Supabase service role key |
| MODEL_VERSION | Version string for model |
