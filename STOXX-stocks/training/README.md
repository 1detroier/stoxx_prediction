# STOXX-stocks Training Pipeline

Local Python training pipeline for the STOXX-stocks European stock prediction platform.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Pipeline Workflow](#pipeline-workflow)
- [Script Reference](#script-reference)
  - [data_fetcher.py](#1-data_fetcherpy)
  - [feature_engineer.py](#2-feature_engineerpy)
  - [train_lstm.py](#3-train_lstmpy)
  - [validation_suite.py](#4-validation_suitepy)
  - [upload_to_supabase.py](#5-upload_to_supabasepy)
- [Configuration](#configuration)
- [Expected Runtime](#expected-runtime)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)
- [Common Errors and Fixes](#common-errors-and-fixes)

---

## Overview

This training pipeline fetches historical stock data, engineers features, trains an LSTM model, validates it for data integrity, and uploads the trained model to Supabase for client-side inference via TensorFlow.js.

### Why Local Training?

| Benefit | Description |
|---------|-------------|
| **Zero Cost** | No cloud compute or API costs |
| **Privacy** | Raw financial data stays local |
| **Flexibility** | Full TensorFlow/Keras support |
| **Reproducibility** | Environment can be versioned |

---

## Prerequisites

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| Python | 3.10+ | Training pipeline |
| pip | Latest | Package management |
| CUDA (optional) | 11.x+ | GPU acceleration |

### Accounts Required

| Service | Purpose | Cost | Sign Up |
|---------|---------|------|---------|
| Alpha Vantage | Historical stock data | Free tier | [alphavantage.co](https://www.alphavantage.co) |
| Supabase | Model storage | Free tier | [supabase.com](https://supabase.com) |

---

## Setup

### 1. Create Virtual Environment

```bash
cd STOXX-stocks/training
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
ALPHA_VANTAGE_API_KEY=your_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Verify Installation

```bash
python --version  # Should be 3.10+
pip list | grep -E "tensorflow|pandas|numpy"
```

---

## Pipeline Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Training Pipeline                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────┐      ┌─────────────────┐      ┌────────────────────────┐
│  data_fetcher │ ───▶ │feature_engineer │ ───▶ │     train_lstm         │
├───────────────┤      ├─────────────────┤      ├────────────────────────┤
│ Fetches 20+  │      │ Creates 12      │      │ Trains LSTM model     │
│ years of     │      │ Z-score         │      │ for 3-day directional │
│ price data   │      │ normalized      │      │ prediction            │
│              │      │ features        │      │                        │
│ 45 CSVs      │      │ 3D panel tensor │      │ TensorFlow.js export  │
│ ~2 min       │      │ ~1 min          │      │ ~10-30 min            │
└───────────────┘      └─────────────────┘      └───────────┬────────────┘
                                                              │
                            ┌─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐      ┌────────────────────────┐
              │  validation_suite        │      │ upload_to_supabase     │
              ├─────────────────────────┤      ├────────────────────────┤
              │ Validates data          │      │ Uploads model to       │
              │ integrity and model      │      │ Supabase Storage and   │
              │ quality                  │      │ inserts metadata       │
              │ Optional but recommended │      │ ~1 min                 │
              └─────────────────────────┘      └────────────────────────┘
```

---

## Script Reference

### 1. data_fetcher.py

Fetches historical daily adjusted prices from Alpha Vantage.

**Usage:**
```bash
python data_fetcher.py --output ../data/raw
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--output` | Required | Output directory for CSV files |
| `--tickers` | All 45 | Specific tickers to fetch |
| `--delay` | 2.4 | Delay between requests (seconds) |
| `--verbose` | False | Verbose logging |

**Examples:**
```bash
# Fetch all 45 companies (default)
python data_fetcher.py --output ../data/raw

# Fetch specific tickers
python data_fetcher.py --tickers ASML.AS SAP.DE --output ../data/raw

# Verbose output
python data_fetcher.py --output ../data/raw --verbose

# Custom rate limit
python data_fetcher.py --output ../data/raw --delay 5.0
```

**Output:** 45 CSV files in `../data/raw/`:
```
data/raw/
├── ASML.AS.csv
├── SAP.DE.csv
├── NOVO-B.CO.csv
└── ... (45 files)
```

**CSV Format:**
```csv
date,open,high,low,close,adjusted_close,volume
2000-01-03,12.50,12.80,12.40,12.75,8.50,1250000
...
```

---

### 2. feature_engineer.py

Processes raw data into features for LSTM training.

**Usage:**
```bash
python feature_engineer.py --input ../data/raw --output ../data/processed
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--input` | Required | Input directory with CSV files |
| `--output` | Required | Output directory |
| `--lookback-1m` | 20 | 1-month lookback window |
| `--lookback-6m` | 120 | 6-month lookback window |
| `--lookback-9m` | 180 | 9-month lookback window |
| `--exclude-distressed` | False | Exclude distressed companies |

**Features Created:**

| Feature | Description |
|---------|-------------|
| `returns_1m` | 1-month returns |
| `returns_6m` | 6-month returns |
| `returns_9m` | 9-month returns |
| `volume_ratio` | Volume vs 20-day average |
| `eur_strength` | EUR/USD 20-day correlation |
| `cross_border` | Revenue >50% outside home country |
| `has_adr` | Secondary ADR listing |
| `ecb_policy_phase` | ECB rate regime |
| `volatility_1m` | 1-month volatility |
| `volatility_3m` | 3-month volatility |
| `momentum_1m` | 1-month momentum |
| `z_close` | Z-score of close price |

**Output:**
```
data/processed/
├── training_panel.h5      # 3D tensor: [samples, 60 timesteps, 12 features]
├── zscore_params.json     # Normalization parameters
└── features_hash.json     # Data version hash
```

**Example Output:**
```
Processing 45 companies...
Total samples: 247,320
  - Healthy: 210,222 (84.9%)
  - Distressed: 37,098 (15.1%)
Features: 12
Timesteps: 60
```

---

### 3. train_lstm.py

Trains the panel LSTM model.

**Usage:**
```bash
python train_lstm.py --input ../data/processed --output ../public/models
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--input` | Required | Input directory with training_panel.h5 |
| `--output` | Required | Output directory for model files |
| `--epochs` | 50 | Number of training epochs |
| `--batch-size` | 32 | Mini-batch size |
| `--learning-rate` | 0.001 | Optimizer learning rate |
| `--lstm-units` | 64 32 | LSTM layer sizes |
| `--dropout` | 0.2 | Dropout rate |
| `--patience` | 10 | Early stopping patience |
| `--gpu` | False | Use GPU if available |

**Model Architecture:**

```
Input Layer (60 timesteps × 12 features)
    │
    ▼
LSTM Layer 1 (64 units, return_sequences=True)
    │
    ▼
Dropout (0.2)
    │
    ▼
LSTM Layer 2 (32 units)
    │
    ▼
Dropout (0.2)
    │
    ▼
Dense Layer (16 units, ReLU)
    │
    ▼
Output Layer (1 unit, Sigmoid)
    │
    ▼
Binary Direction: UP (1) or DOWN (0)
```

**Output:**
```
public/models/
├── model.json          # Model architecture
├── group1-shard1of1.bin # Model weights
├── metadata.json        # Training metadata and Z-score params
└── tensorflowjs_model/ # Alternative format
```

**Example Output:**
```
Loading data...
Training samples: 197,856
Validation samples: 49,464

Epoch 1/50
loss: 0.6932 - accuracy: 0.5123 - val_loss: 0.6912 - val_accuracy: 0.5245
...
Epoch 47/50
loss: 0.5521 - accuracy: 0.6785 - val_loss: 0.5612 - val_accuracy: 0.6532

Training complete!
Accuracy: 67.85%
Validation Accuracy: 65.32%
Distressed Accuracy: 63.45%
```

---

### 4. validation_suite.py

Validates data and model quality.

**Usage:**
```bash
python validation_suite.py --panel ../data/processed/training_panel.h5 --verbose
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--panel` | Required | Path to training_panel.h5 |
| `--verbose` | False | Detailed output |
| `--compare-with` | None | Compare with previous version |

**Validation Checks:**

| Check | Purpose | Pass Threshold |
|-------|---------|----------------|
| Data Leakage | No future information | Max correlation < 0.01 |
| NaN Handling | All missing values imputed | 0 NaN values |
| Z-score Range | Features normalized correctly | -3 < z < 3 |
| Distress Balance | ~15% distressed samples | 10-20% |
| Train/Test Split | Time-series split valid | No shuffle |

**Example Output:**
```
Running validation checks...

✓ Data Leakage Check: PASSED
  - Max feature correlation with target: 0.0023

✓ NaN Handling Check: PASSED
  - NaN values found: 0

✓ Z-score Normalization Check: PASSED
  - All features in range [-3, 3]

✓ Distress Balance Check: PASSED
  - Distressed ratio: 15.1% (target: 15%)

✓ Train/Test Split Check: PASSED
  - No shuffle detected
  - Time ordering preserved

All checks passed! ✓
```

---

### 5. upload_to_supabase.py

Uploads model artifacts to Supabase.

**Usage:**
```bash
python upload_to_supabase.py --model-dir ../public/models
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--model-dir` | Required | Directory with model files |
| `--version` | Auto | Model version string |
| `--stable` | True | Mark as stable production model |
| `--cleanup` | False | Remove local files after upload |

**Actions:**
1. Uploads `model.json` to Supabase Storage
2. Uploads weight files to Supabase Storage
3. Inserts metadata row to `models` table
4. Sets `is_stable = true` (unless `--no-stable`)

**Example Output:**
```
Uploading model to Supabase...
  ✓ model.json uploaded (2.4 KB)
  ✓ group1-shard1of1.bin uploaded (4.2 MB)
  ✓ metadata.json uploaded (1.8 KB)

Inserting metadata...
  ✓ Inserted model record (id: abc123)
  ✓ Set is_stable = true

Model uploaded successfully!
Version: 1.0.0
URL: https://your-project.supabase.co/storage/v1/object/public/models/model.json
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALPHA_VANTAGE_API_KEY` | Yes | Alpha Vantage API key |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase admin key |

### Alpha Vantage Rate Limits

| Tier | Requests/min | Requests/day |
|------|-------------|--------------|
| Free | 25 | 500 |
| $50/mo | 75 | 2,500 |
| $100/mo | 150 | 5,000 |

The data fetcher implements 2.4s delay (25 req/min with buffer).

---

## Expected Runtime

| Stage | CPU | GPU | Notes |
|-------|-----|-----|-------|
| Data Fetcher | ~2 min | ~2 min | Rate limited |
| Feature Engineer | ~1 min | ~1 min | |
| Training | 20-40 min | 5-15 min | Early stopping may reduce |
| Validation | ~2 min | ~2 min | Optional |
| Upload | ~1 min | ~1 min | |
| **Total** | **25-45 min** | **10-25 min** | |

---

## Troubleshooting

### Alpha Vantage Rate Limit

**Error:** `429 Too Many Requests`

**Solution:**
```bash
# Wait 60 seconds and retry
python data_fetcher.py --output ../data/raw

# Or increase delay
python data_fetcher.py --output ../data/raw --delay 5.0
```

### Missing CSV Files

**Error:** `FileNotFoundError: ../data/raw/ASML.AS.csv`

**Solution:**
```bash
# Verify Alpha Vantage key is valid
python -c "import requests; r = requests.get('https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=ASML.AS&apikey=YOUR_KEY'); print(r.json())"

# Re-fetch specific ticker
python data_fetcher.py --tickers ASML.AS --output ../data/raw
```

### Memory Error During Training

**Error:** `MemoryError: Unable to allocate array`

**Solution:**
```bash
# Reduce batch size
python train_lstm.py --input ../data/processed --output ../public/models \
    --batch-size 16

# Or reduce sequence length
python feature_engineer.py --input ../data/raw --output ../data/processed \
    --lookback-1m 10 --lookback-6m 60 --lookback-9m 90
```

### GPU Not Detected

**Error:** `No GPU detected for training`

**Solution:**
```bash
# Check TensorFlow GPU detection
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"

# If empty, GPU not available. CPU training will work.
python train_lstm.py --input ../data/processed --output ../public/models
```

### Supabase Upload Failed

**Error:** `Storage Error: Bucket not found`

**Solution:**
```bash
# Create bucket in Supabase Dashboard > Storage
# Or via SQL Editor:
psql $SUPABASE_URL -c "INSERT INTO storage.buckets (id, name, public) VALUES ('models', 'models', true);"
```

### Z-Score Parameters Missing

**Error:** `KeyError: 'zscore_params'`

**Solution:**
```bash
# Re-run feature engineering
python feature_engineer.py --input ../data/raw --output ../data/processed

# Verify output
ls -la ../data/processed/
```

---

## Advanced Usage

### Custom Ticker List

Edit `data_fetcher.py`:

```python
# Add new tickers
TICKERS = [
    # Existing 45 tickers...
    "DAX.XX",   # Add new
    "CAC40.XX", # Add new
]
```

### GPU Training

Enable CUDA acceleration:

```bash
# Verify GPU available
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"

# Train with GPU
python train_lstm.py --input ../data/processed --output ../public/models --gpu
```

### Model Versioning

```bash
# Upload with custom version
python upload_to_supabase.py --model-dir ../public/models --version 1.1.0

# Don't mark as stable
python upload_to_supabase.py --model-dir ../public/models --no-stable
```

### Batch Retraining

For automated monthly retraining:

```bash
#!/bin/bash
# retrain.sh
cd "$(dirname "$0")"

python data_fetcher.py --output ../data/raw
python feature_engineer.py --input ../data/raw --output ../data/processed
python train_lstm.py --input ../data/processed --output ../public/models
python validation_suite.py --panel ../data/processed/training_panel.h5
python upload_to_supabase.py --model-dir ../public/models --cleanup
```

Add to crontab:
```bash
0 2 1 * * /path/to/retrain.sh >> /var/log/retrain.log 2>&1
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `429 Too Many Requests` | Alpha Vantage rate limit | Wait 60s, retry with `--delay 5.0` |
| `FileNotFoundError` | CSV not downloaded | Re-run data fetcher for specific ticker |
| `MemoryError` | Insufficient RAM | Reduce `--batch-size` or `--lookback` |
| `KeyError: 'zscore_params'` | Feature engineer didn't run | Re-run feature_engineer.py |
| `Storage Error: Bucket not found` | Missing Supabase bucket | Create `models` bucket in dashboard |
| `Invalid API key` | Alpha Vantage key invalid | Check key at alphavantage.co/support |
| `Connection refused` | Network issue | Check internet connection |

---

## Training Universe

### Healthy Companies (38)

ASML.AS, SAP.DE, NOVO-B.CO, MC.PA, NESN.SW, ROG.SW, SIE.DE, TTE.PA, AZN.L, HSBA.L, SU.PA, ALV.DE, SAF.PA, BNP.PA, SAN.MC, ULVR.L, ADYEN.AS, ABBN.SW, DSY.PA, AIR.PA, RR.L, ISP.MI, INGA.AS, CS.PA, OR.PA, ABI.BR, GSK.L, BHP.L, SHEL.L, IBE.MC, ENEL.MI, DTE.DE, CRH.L, FLTR.L, NOKIA.HE, VOLV-B.ST, CARL-B.CO, KBC.BR

### Distressed Companies (7)

| Ticker | Company | Exchange | Issue |
|--------|---------|----------|-------|
| VOW3.DE | Volkswagen | XETR | Emissions scandal |
| TKA.DE | Thyssenkrupp | XETR | Restructuring |
| UBI.PA | Ubisoft | XPAR | Stock decline |
| SINCH.ST | Sinch | XSTO | Accounting issues |
| SDF.DE | K+S | XETR | Commodity pressure |
| DBK.DE | Deutsche Bank | XETR | Legacy issues |
| VNA.DE | Vonovia | XETR | Market conditions |

---

## Model Performance Targets

| Metric | Target | Minimum | Description |
|--------|--------|---------|-------------|
| Overall Accuracy | ~65% | 55% | Balanced across all companies |
| Healthy Accuracy | ~70% | 60% | On non-distressed companies |
| Distressed Accuracy | ~65% | 55% | On distressed companies |

If distressed accuracy falls below 55%, the model is not learning failure patterns effectively.

---

## Support

For issues:
1. Check troubleshooting section above
2. Run with `--verbose` flag for detailed logs
3. Verify environment variables are set correctly
4. Check Alpha Vantage API key validity

---

## License

MIT License - See project root for details.

---

Last updated: 2026-03-18
