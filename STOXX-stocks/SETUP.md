# STOXX-stocks Setup Guide

Complete setup guide for the STOXX-stocks European stock prediction platform.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Clone the Repository](#step-1-clone-the-repository)
- [Step 2: Install Dependencies](#step-2-install-dependencies)
- [Step 3: Create Supabase Project](#step-3-create-supabase-project)
- [Step 4: Run Database Schema](#step-4-run-database-schema)
- [Step 5: Create Storage Bucket](#step-5-create-storage-bucket)
- [Step 6: Configure Environment Variables](#step-6-configure-environment-variables)
- [Step 7: Get API Keys](#step-7-get-api-keys)
- [Step 8: Verify Installation](#step-8-verify-installation)
- [Step 9: Train the Model (Optional)](#step-9-train-the-model-optional)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | Next.js runtime |
| npm | 9+ | Package management |
| Python | 3.10+ | ML training pipeline |
| Git | Latest | Version control |

### Required Accounts

| Service | Purpose | Cost |
|---------|---------|------|
| [Supabase](https://supabase.com) | Database & Storage | Free tier (500MB) |
| [Finnhub](https://finnhub.io) | Real-time quotes | Free tier (60 calls/min) |
| [Alpha Vantage](https://alphavantage.co) | Historical data | Free tier (25 calls/min) |

---

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd STOXX-stocks
```

If you don't have the repository yet, this project should be at:

```
STOXX-stocks/
```

---

## Step 2: Install Dependencies

Install Node.js dependencies:

```bash
npm install
```

Install Python dependencies (for training):

```bash
cd training
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

---

## Step 3: Create Supabase Project

### 3.1 Create New Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Enter project details:
   - **Name**: `stoxx-stocks` (or your preference)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to you
4. Click **Create new project**
5. Wait 2-3 minutes for provisioning

### 3.2 Get Supabase Credentials

After project creation:

1. Go to **Project Settings** (gear icon)
2. Click **API**
3. Copy these values:
   - **Project URL**: `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret**: `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

---

## Step 4: Run Database Schema

### 4.1 Open SQL Editor

1. In Supabase Dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**

### 4.2 Run Schema SQL

Copy and paste the contents of `supabase/schema.sql`:

```sql
-- This file contains:
-- - companies table (metadata for tracked stocks)
-- - prices table (historical OHLCV data)
-- - models table (ML model metadata)
-- - predictions table (prediction logs)
-- - Row Level Security (RLS) policies
-- - Storage bucket for models
-- - Useful views
```

Run: Click **Run** or press `Ctrl+Enter`

### 4.3 Run Seed SQL

Click **New query** again and paste `supabase/seed.sql`:

```sql
-- This inserts 45 company records:
-- - 38 healthy companies
-- - 7 distressed companies
```

Run: Click **Run**

### 4.4 Verify Setup

Run this query to verify:

```sql
SELECT COUNT(*) as company_count FROM companies;
```

Expected result: `45`

---

## Step 5: Create Storage Bucket

### Option A: Via SQL (Recommended)

In SQL Editor, run:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('models', 'models', true)
ON CONFLICT (id) DO NOTHING;
```

### Option B: Via Dashboard

1. Go to **Storage** in the left sidebar
2. Click **New bucket**
3. Configure:
   - **Name**: `models`
   - **Public bucket**: ✅ Check
4. Click **Create bucket**

---

## Step 6: Configure Environment Variables

### 6.1 Create .env.local

```bash
cp .env.example .env.local
```

### 6.2 Fill in Values

Edit `.env.local` with your credentials:

```env
# Supabase Configuration (from Step 3.2)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# External API Keys (from Step 7)
FINNHUB_API_KEY=your_finnhub_api_key
FINNHUB_KEY=your_finnhub_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key

# Model Configuration
NEXT_PUBLIC_MODEL_PATH=/models/latest/model.json
```

### 6.3 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin key (server-side only) |
| `FINNHUB_API_KEY` | Yes | Finnhub API key |
| `FINNHUB_KEY` | Yes | Alternative Finnhub key name |
| `ALPHA_VANTAGE_API_KEY` | Yes | Alpha Vantage API key |
| `NEXT_PUBLIC_MODEL_PATH` | No | Default: `/models/latest/model.json` |

---

## Step 7: Get API Keys

### 7.1 Finnhub API Key

1. Go to [finnhub.io](https://finnhub.io)
2. Click **Get free API key**
3. Sign up or sign in
4. Copy your API key from the dashboard

**Free Tier Limits:**
- 60 calls/minute
- Real-time quotes with 15-min delay
- US and crypto symbols included

### 7.2 Alpha Vantage API Key

1. Go to [alphavantage.co](https://www.alphavantage.co)
2. Click **GET FREE API KEY**
3. Fill in the form
4. Check email for your API key

**Free Tier Limits:**
- 25 requests/minute
- 5 requests/day
- 20+ years of daily data

**Important:** Alpha Vantage has strict rate limits. The data fetcher implements:
- 2.4 second delay between requests
- Exponential backoff on 429 errors

---

## Step 8: Verify Installation

### 8.1 Build the Project

```bash
npm run build
```

Expected output: Build completed successfully

### 8.2 Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 8.3 Verify API Routes

Test the API endpoints:

```bash
# Get companies list
curl http://localhost:3000/api/companies

# Get prices for a ticker
curl "http://localhost:3000/api/prices?ticker=ASML.AS&limit=10"
```

---

## Step 9: Train the Model (Optional)

The model training is optional but recommended for full functionality:

### 9.1 Prepare Training Environment

```bash
cd training
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 9.2 Configure Training Environment

```bash
cp .env.example .env
```

Edit `.env` with:
- `ALPHA_VANTAGE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 9.3 Run Training Pipeline

```bash
# Step 1: Fetch 20+ years of data (~2 minutes)
python data_fetcher.py --output ../data/raw

# Step 2: Engineer features (~1 minute)
python feature_engineer.py --input ../data/raw --output ../data/processed

# Step 3: Train LSTM model (~10-30 minutes)
python train_lstm.py --input ../data/processed --output ../public/models

# Step 4: Validate (optional)
python validation_suite.py --panel ../data/processed/training_panel.h5 --verbose

# Step 5: Upload to Supabase
python upload_to_supabase.py --model-dir ../public/models
```

See [docs/TRAINING.md](../docs/TRAINING.md) for detailed training documentation.

---

## Troubleshooting

### Supabase Connection Issues

**Error:** `Missing Supabase environment variables`

**Solution:**
1. Verify `.env.local` exists
2. Check that `NEXT_PUBLIC_SUPABASE_URL` is correct (format: `https://xxx.supabase.co`)
3. Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set
4. Restart the dev server after changes

---

**Error:** `RLS policy denied` or `permission denied`

**Solution:**
1. Go to Supabase SQL Editor
2. Verify RLS is enabled on all tables
3. Check that policies were created correctly
4. Try running schema.sql again

---

### API Key Issues

**Error:** `External API not configured`

**Solution:**
1. Verify `FINNHUB_API_KEY` is set in `.env.local`
2. Try both `FINNHUB_API_KEY` and `FINNHUB_KEY` (some versions use different names)

---

**Error:** `429 Too Many Requests` (Alpha Vantage)

**Solution:**
1. Wait 60 seconds and retry
2. The data fetcher implements rate limiting automatically
3. Consider upgrading to Alpha Vantage premium for faster fetching

---

### Build Errors

**Error:** Module not found or build fails

**Solution:**

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

---

**Error:** TypeScript errors

**Solution:**

```bash
# Check TypeScript version
npx tsc --version

# Should be 5.x
npm install typescript@latest

# Type check manually
npx tsc --noEmit
```

---

### Model Loading Issues

**Error:** `Model not found` or `Failed to load model`

**Solution:**
1. Verify model was uploaded to Supabase Storage
2. Check that `models` bucket exists and is public
3. Verify metadata was inserted in `models` table
4. Check browser console for specific errors

---

**Error:** `Z-score parameters not found`

**Solution:**
1. Verify `upload_to_supabase.py` ran successfully
2. Check `models` table has a row with `zscore_params`
3. Run `upload_to_supabase.py` again if needed

---

### Data Issues

**Error:** No price data showing

**Solution:**
1. Verify prices were loaded into Supabase
2. Check `prices` table has data:
   ```sql
   SELECT COUNT(*) FROM prices;
   ```
3. Verify the ticker is correct (e.g., `ASML.AS`, not `ASML`)

---

## FAQ

### Q: Why do I need both Finnhub and Alpha Vantage?

**A:** Each serves a different purpose:
- **Finnhub**: Real-time quotes (15-min delayed) for the dashboard
- **Alpha Vantage**: Historical daily data for model training

---

### Q: Can I use different stock exchanges?

**A:** Yes, but the current implementation uses STOXX 600 tickers. To add new stocks:
1. Update the ticker list in `training/data_fetcher.py`
2. Add company metadata to `supabase/seed.sql`
3. Retrain the model

---

### Q: How often should I retrain the model?

**A:** Recommended:
- Monthly for production systems
- After significant market events (crashes, rallies)
- When accuracy drops below minimum thresholds

---

### Q: Can I run this without Supabase?

**A:** Currently no. The project is tightly integrated with Supabase for:
- PostgreSQL database (prices, companies, predictions)
- Storage (model files)
- Row Level Security (access control)

Alternative backends would require significant refactoring.

---

### Q: How do I add more companies?

**A:**
1. Add to `supabase/seed.sql`:
   ```sql
   INSERT INTO companies (ticker, name, exchange, sector, country, is_distressed)
   VALUES ('NEW.XX', 'New Company', 'XEXC', 'Technology', 'DE', false);
   ```
2. Update `training/data_fetcher.py` with new ticker
3. Re-run training pipeline

---

### Q: What's the 15-minute delay on Finnhub quotes?

**A:** The free Finnhub tier provides quotes with 15-minute delay. This is standard for free market data. For real-time data, consider upgrading to Finnhub Pro ($50/month).

---

### Q: Why does training take so long?

**A:** Training time depends on:
- **Data fetching**: ~2 minutes (rate limited)
- **Feature engineering**: ~1 minute
- **Model training**: 10-30 minutes (GPU recommended)
- **Upload**: ~1 minute

Total: 15-35 minutes for a complete run.

---

### Q: Can I use a GPU for training?

**A:** Yes, if you have a CUDA-compatible GPU:
1. Install CUDA drivers
2. Install TensorFlow with GPU support:
   ```bash
   pip install tensorflow[and-cuda]
   ```
3. Training should automatically use GPU

Without GPU, training runs on CPU (slower but works).

---

### Q: How do I update the production model?

**A:**
1. Re-run the training pipeline locally
2. Upload to Supabase:
   ```bash
   python upload_to_supabase.py --model-dir ../public/models
   ```
3. The frontend will automatically use the new model on next load

---

## Next Steps

After setup:

1. **Explore the dashboard** at [http://localhost:3000](http://localhost:3000)
2. **Train the model** following [docs/TRAINING.md](../docs/TRAINING.md)
3. **Read the architecture** in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
4. **Check the API** in [docs/API.md](../docs/API.md)

---

## Support

For issues:
1. Check this troubleshooting section
2. Search existing GitHub issues
3. Create a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details

---

Last updated: 2026-03-18
