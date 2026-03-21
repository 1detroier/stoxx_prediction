# STOXX-stocks

**European Stock Prediction Platform** — Interactive dashboard with browser-based ML inference.

Next.js 14 · TensorFlow.js · Supabase · Zero-cost infrastructure

[Live Demo](#) · [Documentation](#) · [Vercel Deploy](#)

---

## What It Does

Predict 10-day directional movement (↑ Up / ↓ Down) for 45 STOXX European stocks — **in your browser**, with the model running client-side. No server-side inference, no GPU costs.

```
Browser opens dashboard
       │
       ├── Fetches historical prices from Supabase
       ├── Fetches live quote from Finnhub (15-min delay)
       │
       ├── Extracts 18 technical features (returns, volatility, MACD, RSI...)
       ├── Z-score normalizes using training parameters
       ├── Runs LSTM inference (TensorFlow.js, ~250 KB model)
       │
       └── Displays prediction + confidence + chart
```

---

## Key Features

| Feature | Details |
|---------|---------|
| **TradingView Charts** | Lightweight Charts 4.2 with resolution switching |
| **Live Quotes** | Finnhub proxy, 60 req/min rate-limited |
| **Browser ML** | BiLSTM [128+32] — 64,193 params, loads in ~1s |
| **18 Features** | Log returns, Z-score returns, ATR, RSI, MACD, ECB phase... |
| **Distress-Aware** | 15% of training samples from 7 distressed companies |
| **Walk-Forward CV** | 4-fold validation with purge/embargo — no data leakage |
| **Prediction Tracking** | Log predictions, compare vs actual outcomes |
| **Security Headers** | CSP, HSTS, X-Frame-Options via Next.js middleware |

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, FINNHUB_API_KEY

# 3. Start development
npm run dev
# → http://localhost:3000
```

See [SETUP.md](./SETUP.md) for full Supabase setup instructions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Charts | TradingView Lightweight Charts 4.2 |
| ML Inference | TensorFlow.js 4.22 (browser, no GPU) |
| ML Training | Python 3.11 + TensorFlow 2.15 (local) |
| Database | Supabase (PostgreSQL + Storage) |
| Data Sources | Finnhub (live), yfinance (historical) |
| Deployment | Vercel (Next.js preset) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                          │
│                                                                   │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │  Dashboard   │  │   Charts     │  │  TensorFlow.js      │  │
│   │  (Next.js)   │  │ (TradingView)│  │  Model Inference     │  │
│   └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└──────────┼──────────────────┼────────────────────┼──────────────┘
           │                  │                    │
           │ GET /api/        │ GET /api/          │ Loads /models/
           │ companies, prices │ finnhub/quote     │ distress/model.json
           │                  │                    │
┌──────────▼──────────────────▼────────────────────▼──────────────┐
│                     Next.js (Vercel Serverless)                   │
│                                                                   │
│   Rate limiter (60/min IP)  ·  Security headers  ·  API key proxy │
│                                                                   │
│   /api/models/latest ──────────────► local metadata.json           │
│         │  (or Supabase fallback)                                 │
│         ▼                                                          │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │                   Supabase                                 │   │
│   │  companies  ·  prices  ·  models  ·  predictions          │   │
│   └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Training Pipeline

```bash
cd training
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 1. Fetch historical data (~2 min)
python data_fetcher.py --output ../data/raw

# 2. Engineer 18 features (~1 min)
python feature_engineer.py --input ../data/raw --output ../data/processed

# 3. Train model (~4 hours, CPU)
python train_lstm.py --input ../data/processed --output ../models

# 4. Convert to TensorFlow.js (~30 sec)
python ./training/convert_tfjs_model.py \
  --input ./models_bce/distress_predictor.keras \
  --output ./public/models/distress

# 5. Commit the TFJS files → push → Vercel deploys automatically
```

See [docs/TRAINING.md](./docs/TRAINING.md) for detailed pipeline documentation.

---

## Project Structure

```
STOXX-stocks/
├── src/
│   ├── app/
│   │   ├── api/                          # API routes
│   │   │   ├── companies/               # Company list & filters
│   │   │   ├── prices/                  # Historical OHLCV data
│   │   │   ├── finnhub/quote/          # Live quote proxy
│   │   │   ├── models/latest/          # Model metadata
│   │   │   └── predictions/             # Prediction log
│   │   ├── page.tsx                    # Dashboard home
│   │   └── stock/[ticker]/page.tsx    # Individual stock page
│   ├── components/
│   │   ├── charts/                     # TradingView charts
│   │   ├── dashboard/                  # Company cards, filters
│   │   ├── metrics/                    # Sharpe ratio, risk metrics
│   │   ├── predictions/                 # Prediction panel, confidence meter
│   │   └── ui/                        # Alert, Card, Skeleton, Toast...
│   ├── hooks/                          # useApiCall, useModelLoader, usePrediction
│   ├── lib/
│   │   ├── ml/
│   │   │   ├── ModelService.ts        # TFJS loading, inference, disposal
│   │   │   ├── FeatureExtractor.ts    # 18-feature extraction from OHLCV
│   │   │   ├── ZScoreNormalizer.ts   # Z-score normalization
│   │   │   └── types.ts              # FEATURE_NAMES (18), MODEL_CONFIG
│   │   ├── repositories/              # Supabase data access
│   │   ├── api-utils.ts              # Shared error handling, search escaping
│   │   ├── rate-limit.ts             # In-memory 60/min rate limiter
│   │   └── supabase.ts               # Client-side Supabase
│   ├── middleware.ts                  # Security headers (CSP, HSTS, X-Frame...)
│   └── types/
├── public/models/distress/           # Deployed TFJS model (committed to git)
│   ├── model.json                     # Model topology
│   └── group1-shard1of1.bin          # Weights (~257 KB)
├── supabase/
│   ├── schema.sql                    # Tables + RLS policies
│   └── seed.sql                      # 45 companies (38H + 7D)
├── training/                          # Python ML pipeline
│   ├── data_fetcher.py               # yfinance historical data
│   ├── feature_engineer.py           # 18 features, Z-score, panel tensor
│   ├── train_lstm.py                # BiLSTM training, BCE loss, walk-forward CV
│   ├── convert_tfjs_model.py        # Keras → TFJS (Windows-safe)
│   ├── upload_to_supabase.py         # Upload model to Supabase Storage
│   └── requirements.txt
├── vercel.json                       # Vercel deployment config
├── next.config.js
└── package.json
```

---

## Model Architecture

| Property | Value |
|----------|-------|
| **Type** | BiLSTM (Bidirectional) → LSTM → Dense → Sigmoid |
| **Units** | 128 (forward) + 128 (backward) → 32 → 1 |
| **Input** | `[batch, 60 timesteps, 18 features]` |
| **Lookback** | 60 trading days (~3 months) |
| **Prediction** | 10-day directional (binary crossentropy) |
| **Training** | 4-fold walk-forward CV, purge + embargo |
| **Data** | 7 years, 45 companies, ~56K samples |
| **Accuracy** | ~50–55% (expected for stock direction — near-random baseline) |

### 18 Features

| Group | Features |
|-------|---------|
| Returns (4) | `return_1d`, `return_1m`, `return_6m`, `return_9m` |
| Z-Score Returns (4) | `z_return_1d`, `z_return_1m`, `z_return_6m`, `z_return_9m` |
| Vol/Volume (3) | `volatility_20d`, `atr_ratio`, `volume_ratio` |
| Momentum (4) | `rsi_14`, `macd`, `macd_signal`, `macd_hist` |
| European (3) | `eur_strength`, `cross_border`, `ecb_policy_phase` |

---

## Training Universe

**38 healthy + 7 distressed** European companies across 12 exchanges.

| Distressed | Ticker | Company |
|------------|--------|---------|
| ⚠️ | VOW3.DE | Volkswagen |
| ⚠️ | TKA.DE | Thyssenkrupp |
| ⚠️ | UBI.PA | Ubisoft |
| ⚠️ | SINCH.ST | Sinch |
| ⚠️ | SDF.DE | K+S |
| ⚠️ | DBK.DE | Deutsche Bank |
| ⚠️ | VNA.DE | Vonovia |

---

## Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Server-side only (never exposed to client)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
FINNHUB_API_KEY=xxx

# Model path (defaults to /models/distress/model.json)
NEXT_PUBLIC_MODEL_PATH=/models/distress/model.json
```

Set these in **Vercel → Settings → Environment Variables** before deploying.

---

## Security

- ✅ API keys server-side only — proxied through Next.js API routes
- ✅ Supabase RLS enabled on all tables
- ✅ Rate limiting: 60 req/min per IP on Finnhub proxy
- ✅ Error messages sanitized in production (details in dev only)
- ✅ Search injection prevention (LIKE pattern escaping)
- ✅ Ticker validation against 45-company universe
- ✅ Security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- ✅ TFJS model from static path — no path traversal risk

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git remote add origin https://github.com/YOUR_USER/stoxx-stocks.git
git push -u origin main

# 2. Import in Vercel
# → vercel.com/new → Import your repo

# 3. Add Environment Variables in Vercel dashboard:
#    NEXT_PUBLIC_SUPABASE_URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY
#    SUPABASE_SERVICE_ROLE_KEY
#    FINNHUB_API_KEY

# 4. Deploy — Vercel auto-builds with npm run build
```

TFJS model files are committed to `public/models/distress/` — no build-time conversion needed.

---

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](./SETUP.md) | Full setup guide (Supabase, API keys, training) |
| [docs/TRAINING.md](./docs/TRAINING.md) | Training pipeline walkthrough |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture & patterns |
| [docs/API.md](./docs/API.md) | API endpoint reference |
| [PRD.md](./PRD.md) | Product requirements document |
| [AGENTS.md](../AGENTS.md) | React best practices (Vercel Engineering) |

---

## License

MIT
