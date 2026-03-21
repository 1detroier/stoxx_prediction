# STOXX-stocks Training Pipeline

Complete guide to training the LSTM model for the STOXX-stocks platform.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Pipeline Stages](#pipeline-stages)
- [Step-by-Step Guide](#step-by-step-guide)
- [Configuration](#configuration)
- [Expected Outputs](#expected-outputs)
- [Model Performance](#model-performance)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)

---

## Overview

The training pipeline is a local Python workflow that:

1. **Fetches** 20+ years of historical stock prices from Alpha Vantage
2. **Engineers** features including Z-score normalization and rolling returns
3. **Trains** a panel-based LSTM model for 3-day directional prediction
4. **Validates** the model for data leakage and quality
5. **Uploads** the trained model to Supabase for browser inference

### Why Local Training?

| Benefit | Description |
|---------|-------------|
| **Zero Cost** | No cloud compute or API costs |
| **Privacy** | Raw financial data stays local |
| **Flexibility** | Full TensorFlow/Keras support |
| **Control** | Reproducible, version-controlled training |

---

## Prerequisites

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| Python | 3.10+ | Training pipeline |
| pip | Latest | Package management |
| CUDA (optional) | 11.x+ | GPU acceleration |

### Accounts Required

| Service | Purpose | Sign Up |
|---------|---------|---------|
| Alpha Vantage | Historical stock data | [alphavantage.co](https://www.alphavantage.co) |
| Supabase | Model storage | [supabase.com](https://supabase.com) |

### Python Dependencies

Install from `training/requirements.txt`:

```bash
cd training
pip install -r requirements.txt
```

Key packages:
- `pandas`, `numpy`: Data manipulation
- `tensorflow`: Deep learning
- `tensorflowjs`: TensorFlow.js export
- `h5py`: HDF5 file handling
- `supabase`: Supabase Python client

---

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Training Pipeline                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────┐      ┌─────────────────┐      ┌────────────────────────┐
│  data_fetcher │ ───▶ │feature_engineer │ ───▶ │     train_lstm         │
├───────────────┤      ├─────────────────┤      ├────────────────────────┤
│ Input:        │      │ Input:          │      │ Input:                 │
│ - API key     │      │ - Raw CSVs      │      │ - training_panel.h5    │
│               │      │                 │      │                        │
│ Output:       │      │ Output:         │      │ Output:                │
│ - 45 CSV files│      │ - training_panel│      │ - tfjs_model/          │
│   (20+ years) │      │ - zscore_params │      │ - metadata.json         │
│               │      │ - features_hash │      │                        │
│ ~2 min        │      │ ~1 min         │      │ ~10-30 min             │
└───────────────┘      └─────────────────┘      └───────────┬────────────┘
                                                              │
                            ┌─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐      ┌────────────────────────┐
              │  validation_suite       │      │ upload_to_supabase     │
              ├─────────────────────────┤      ├────────────────────────┤
              │ Checks:                 │      │ Actions:                │
              │ - Data leakage          │      │ 1. Upload model.json   │
              │ - NaN handling          │      │ 2. Upload weights.bin │
              │ - Z-score normalization │      │ 3. Insert metadata     │
              │ - Distress balance      │      │ 4. Mark as stable      │
              └─────────────────────────┘      └────────────────────────┘
```

---

## Step-by-Step Guide

### Step 1: Configure Environment

```bash
cd training
cp .env.example .env
```

Edit `.env`:

```env
ALPHA_VANTAGE_API_KEY=your_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Step 2: Fetch Historical Data

Downloads 20+ years of daily adjusted prices for all 45 companies.

```bash
python data_fetcher.py --output ../data/raw
```

**Options:**
```bash
# Fetch specific tickers only
python data_fetcher.py --tickers ASML.AS SAP.DE --output ../data/raw

# Specify date range
python data_fetcher.py --output ../data/raw --start 2000-01-01

# Verbose output
python data_fetcher.py --output ../data/raw --verbose
```

**Expected Duration:** ~2 minutes (rate limited to 2.4s between requests)

**Output:**
```
data/raw/
├── ASML.AS.csv
├── SAP.DE.csv
├── NOVO-B.CO.csv
└── ... (45 files total)
```

### Step 3: Engineer Features

Processes raw data into features for the LSTM model.

```bash
python feature_engineer.py --input ../data/raw --output ../data/processed
```

**Options:**
```bash
# Custom lookback windows
python feature_engineer.py --input ../data/raw --output ../data/processed \
    --lookback-1m 20 --lookback-6m 120

# Skip distressed companies
python feature_engineer.py --input ../data/raw --output ../data/processed \
    --exclude-distressed
```

**Expected Duration:** ~1 minute

**Features Created:**

| Feature | Description | Window |
|---------|-------------|--------|
| `returns_1m` | 1-month returns | 20 days |
| `returns_6m` | 6-month returns | 120 days |
| `returns_9m` | 9-month returns | 180 days |
| `volume_ratio` | Volume vs 20-day avg | 20 days |
| `eur_strength` | EUR/USD correlation | 20 days |
| `cross_border` | Foreign revenue flag | - |
| `has_adr` | ADR listing flag | - |
| `ecb_policy_phase` | ECB rate regime | - |
| `volatility_1m` | 1-month volatility | 20 days |
| `volatility_3m` | 3-month volatility | 60 days |
| `momentum_1m` | 1-month momentum | 20 days |
| `z_close` | Z-score of close price | - |

**Output:**
```
data/processed/
├── training_panel.h5      # 3D tensor: [samples, 60 timesteps, 12 features]
├── zscore_params.json     # Normalization parameters (CRITICAL)
└── features_hash.json     # Data version hash
```

### Step 4: Train the Model

Trains a panel-based LSTM for 3-day directional prediction.

```bash
python train_lstm.py --input ../data/processed --output ../public/models
```

**Options:**
```bash
# GPU training (if available)
python train_lstm.py --input ../data/processed --output ../public/models \
    --gpu

# Custom hyperparameters
python train_lstm.py --input ../data/processed --output ../public/models \
    --epochs 100 --batch-size 32 --learning-rate 0.001

# Smaller model for faster training
python train_lstm.py --input ../data/processed --output ../public/models \
    --lstm-units 32 16 --dropout 0.3
```

**Expected Duration:**
- CPU: 20-40 minutes
- GPU: 5-15 minutes

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
├── metadata.json        # Training metadata
└── tensorflowjs_model/ # Alternative format
```

### Step 5: Validate the Model (Optional)

Runs validation checks before deployment.

```bash
python validation_suite.py --panel ../data/processed/training_panel.h5 --verbose
```

**Checks Performed:**

| Check | Purpose | Pass Threshold |
|-------|---------|----------------|
| Data Leakage | No future information in features | 0% leakage |
| NaN Handling | All NaN values imputed | 0 NaN |
| Z-score Range | Features normalized correctly | -3 < z < 3 |
| Distress Balance | ~15% distressed samples | 10-20% |
| Train/Test Split | Time-series split valid | No shuffle |

**Expected Duration:** ~2 minutes

### Step 6: Upload to Supabase

Uploads model artifacts and metadata.

```bash
python upload_to_supabase.py --model-dir ../public/models
```

**Options:**
```bash
# Set custom version
python upload_to_supabase.py --model-dir ../public/models \
    --version 1.0.0

# Don't mark as stable yet
python upload_to_supabase.py --model-dir ../public/models \
    --no-stable

# Clean up local files after upload
python upload_to_supabase.py --model-dir ../public/models \
    --cleanup
```

**Expected Duration:** ~1 minute

**Actions:**
1. Uploads `model.json` to Supabase Storage
2. Uploads weight files to Supabase Storage
3. Inserts metadata row to `models` table
4. Sets `is_stable = true` (unless `--no-stable`)

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALPHA_VANTAGE_API_KEY` | Yes | Alpha Vantage API key |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase admin key |

### Training Hyperparameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--epochs` | 50 | Training epochs |
| `--batch-size` | 32 | Mini-batch size |
| `--learning-rate` | 0.001 | Optimizer learning rate |
| `--lstm-units` | 64 32 | LSTM layer sizes |
| `--dropout` | 0.2 | Dropout rate |
| `--validation-split` | 0.2 | Validation data fraction |
| `--lookback` | 60 | Number of timesteps |

### Advanced Options

```bash
# Custom ticker list
python data_fetcher.py --tickers TICKER1 TICKER2 --output ../data/raw

# Exclude distressed companies
python feature_engineer.py --exclude-distressed

# Early stopping patience
python train_lstm.py --patience 10

# Custom loss function
python train_lstm.py --loss binary_crossentropy
```

---

## Expected Outputs

### Data Fetcher Output

```
$ python data_fetcher.py --output ../data/raw

Fetching 45 tickers...
Progress: 45/45 [████████████████████] 100%
Success: 45 | Failed: 0
Duration: 108.2s

Output: ../data/raw/ (45 CSV files)
```

### Feature Engineer Output

```
$ python feature_engineer.py --input ../data/raw --output ../data/processed

Processing 45 companies...
Total samples: 247,320
  - Healthy: 210,222 (84.9%)
  - Distressed: 37,098 (15.1%)
Features: 12
Timesteps: 60

Output:
  - training_panel.h5 (247,320 × 60 × 12)
  - zscore_params.json (12 features)
  - features_hash.json
```

### Training Output

```
$ python train_lstm.py --input ../data/processed --output ../public/models

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

Model exported to:
  - ../public/models/model.json
  - ../public/models/group1-shard1of1.bin
  - ../public/models/metadata.json
```

### Validation Output

```
$ python validation_suite.py --panel ../data/processed/training_panel.h5 --verbose

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

All checks passed! Model is ready for deployment.
```

---

## Model Performance

### Target Metrics

| Metric | Target | Minimum | Description |
|--------|--------|---------|-------------|
| Overall Accuracy | ~65% | 55% | Balanced across all companies |
| Healthy Accuracy | ~70% | 60% | On non-distressed companies |
| Distressed Accuracy | ~65% | 55% | On distressed companies |

### Why These Targets?

| Metric | Rationale |
|--------|-----------|
| 55% minimum | Above random guess (50%) |
| 70% healthy target | Learn normal market patterns |
| 65% distressed target | Distressed stocks are noisy |

### If Targets Aren't Met

| Issue | Solution |
|-------|----------|
| Overall < 55% | Increase model capacity or training data |
| Healthy < 60% | Check feature quality, increase epochs |
| Distressed < 55% | Add more distressed samples, adjust class weights |

---

## Troubleshooting

### Common Errors

#### Alpha Vantage Rate Limit

**Error:** `429 Too Many Requests`

**Solution:**
```bash
# Wait 60 seconds and retry
python data_fetcher.py --output ../data/raw

# Or increase delay
python data_fetcher.py --output ../data/raw --delay 5.0
```

#### Missing CSV Files

**Error:** `FileNotFoundError: ../data/raw/ASML.AS.csv`

**Solution:**
```bash
# Check if Alpha Vantage key is valid
python -c "import requests; r = requests.get('https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=ASML.AS&apikey=YOUR_KEY'); print(r.json())"

# Re-fetch specific ticker
python data_fetcher.py --tickers ASML.AS --output ../data/raw
```

#### Memory Error During Training

**Error:** `MemoryError: Unable to allocate array`

**Solution:**
```bash
# Reduce batch size
python train_lstm.py --input ../data/processed --output ../public/models \
    --batch-size 16

# Or reduce sequence length
python train_lstm.py --input ../data/processed --output ../public/models \
    --lookback 30
```

#### Z-Score Parameters Missing

**Error:** `KeyError: 'zscore_params'`

**Solution:**
```bash
# Re-run feature engineering
python feature_engineer.py --input ../data/raw --output ../data/processed

# Check output files
ls -la ../data/processed/
```

#### Supabase Upload Failed

**Error:** `Storage Error: Bucket not found`

**Solution:**
```bash
# Create bucket manually in Supabase Dashboard
# Or run via SQL:
psql $SUPABASE_URL -c "INSERT INTO storage.buckets (id, name, public) VALUES ('models', 'models', true);"
```

### Debug Mode

Enable verbose logging:

```bash
# Data fetcher
python data_fetcher.py --output ../data/raw --verbose --debug

# Feature engineer
python feature_engineer.py --input ../data/raw --output ../data/processed --verbose

# Training
python train_lstm.py --input ../data/processed --output ../public/models --verbose
```

---

## Advanced Topics

### Custom Ticker List

Edit `training/data_fetcher.py`:

```python
# Add new tickers
TICKERS = [
    # Existing tickers...
    "NEW1.XX",  # New exchange
    "NEW2.XX",
]
```

Then update `supabase/seed.sql` and re-run training.

### Model Retraining Schedule

For production systems:

```bash
# Monthly retraining cron job (example)
0 2 1 * * cd training && python data_fetcher.py --output ../data/raw && \
    python feature_engineer.py --input ../data/raw --output ../data/processed && \
    python train_lstm.py --input ../data/processed --output ../public/models && \
    python upload_to_supabase.py --model-dir ../public/models
```

### GPU Training

Enable CUDA:

```bash
# Verify GPU available
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"

# Should output: [PhysicalDevice(name='/physical_device:GPU:0', device_type='GPU')]

# Train with GPU
python train_lstm.py --input ../data/processed --output ../public/models --gpu
```

### Distributed Training

For very large datasets:

```bash
# Split data across GPUs
python train_lstm.py --input ../data/processed --output ../public/models \
    --strategy mirrored --gpus 2
```

### Model Versioning

```bash
# Upload with custom version
python upload_to_supabase.py --model-dir ../public/models --version 1.1.0

# Compare versions
python validation_suite.py --panel ../data/processed/training_panel.h5 \
    --compare-with 1.0.0
```

---

## References

| Resource | Link |
|----------|------|
| Alpha Vantage Docs | [alphavantage.co/documentation](https://www.alphavantage.co/documentation/) |
| TensorFlow Guide | [tensorflow.org/guide](https://www.tensorflow.org/guide) |
| LSTM Tutorial | [tensorflow.org/tutorials/timeseries](https://www.tensorflow.org/tutorials/timeseries/lstm_exercise) |
| TensorFlow.js | [tensorflow.org/js](https://www.tensorflow.org/js) |
| Supabase Python | [supabase.com/docs](https://supabase.com/docs/reference/python) |

---

## Training Universe

### Healthy Companies (38)

ASML.AS, SAP.DE, NOVO-B.CO, MC.PA, NESN.SW, ROG.SW, SIE.DE, TTE.PA, AZN.L, HSBA.L, SU.PA, ALV.DE, SAF.PA, BNP.PA, SAN.MC, ULVR.L, ADYEN.AS, ABBN.SW, DSY.PA, AIR.PA, RR.L, ISP.MI, INGA.AS, CS.PA, OR.PA, ABI.BR, GSK.L, BHP.L, SHEL.L, IBE.MC, ENEL.MI, DTE.DE, CRH.L, FLTR.L, NOKIA.HE, VOLV-B.ST, CARL-B.CO, KBC.BR

### Distressed Companies (7)

VOW3.DE (Volkswagen), TKA.DE (Thyssenkrupp), UBI.PA (Ubisoft), SINCH.ST (Sinch), SDF.DE (K+S), DBK.DE (Deutsche Bank), VNA.DE (Vonovia)

---

Last updated: 2026-03-18
