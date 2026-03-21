# STOXX-stocks Architecture

Technical architecture documentation for the STOXX-stocks European stock prediction platform.

## Table of Contents

- [System Overview](#system-overview)
- [High-Level Architecture](#high-level-architecture)
- [Component Diagram](#component-diagram)
- [Data Flow](#data-flow)
- [ML Pipeline Architecture](#ml-pipeline-architecture)
- [Security Model](#security-model)
- [Database Schema](#database-schema)
- [API Architecture](#api-architecture)
- [Performance Considerations](#performance-considerations)
- [Technology Decisions](#technology-decisions)

---

## System Overview

STOXX-stocks is a zero-cost European stock prediction platform that combines:

1. **Web Dashboard**: Interactive stock charts and predictions
2. **Supabase Backend**: Database, storage, and real-time subscriptions
3. **Local ML Pipeline**: Python scripts for data fetching and model training
4. **Browser Inference**: TensorFlow.js for client-side predictions

### Design Principles

| Principle | Implementation |
|-----------|-----------------|
| **Zero-Cost** | Free tiers only (Supabase, Vercel, Finnhub free) |
| **Local Training** | Model training runs on user's machine |
| **Privacy-First** | No sensitive data leaves the browser |
| **Type Safety** | Strict TypeScript throughout |
| **SOLID Design** | Repository pattern, single responsibility |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Browser                                  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Next.js 14 (App Router)                       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│ │
│  │  │   Pages      │  │  API Routes  │  │   React Components     ││ │
│  │  │  /dashboard  │  │  /api/*      │  │  - StockChart          ││ │
│  │  │  /stock/[id] │  │              │  │  - PredictionPanel     ││ │
│  │  │              │  │              │  │  - CompanySelector      ││ │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                               │                                       │
│                               │ Server-Side                           │
│  ┌────────────────────────────┼────────────────────────────────────┐ │
│  │                      Supabase Cloud                               │ │
│  │  ┌──────────────┐  ┌──────┴──────┐  ┌────────────────────────┐   │ │
│  │  │  PostgreSQL  │  │   Storage   │  │    Realtime (future)   │   │ │
│  │  │  companies   │  │   models/   │  │                       │   │ │
│  │  │  prices      │  │             │  │                       │   │ │
│  │  │  models      │  │             │  │                       │   │ │
│  │  │  predictions │  │             │  │                       │   │ │
│  │  └──────────────┘  └─────────────┘  └────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                               │                                       │
│  ┌────────────────────────────┼────────────────────────────────────┐ │
│  │              External APIs (Proxied)                              │ │
│  │  ┌──────────────┐  ┌──────────────┐                             │ │
│  │  │   Finnhub    │  │ Alpha Vantage │                             │ │
│  │  │ Real-time    │  │  Historical   │                             │ │
│  │  │ 15-min delay │  │  20+ years    │                             │ │
│  │  └──────────────┘  └──────────────┘                             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               ▲
                               │ Model Upload
                               │
┌─────────────────────────────────────────────────────────────────────┐
│                      Local Python Pipeline                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ data_fetcher │─▶│feature_engin │─▶│     train_lstm.py         │ │
│  │ Alpha Vantage│  │ Z-score      │  │  Panel LSTM + TensorFlow   │ │
│  │ 45 tickers   │  │ Rolling      │  │  .h5 → .json conversion    │ │
│  └──────────────┘  └──────────────┘  └──────────────┬─────────────┘ │
│                                                      │               │
│  ┌──────────────────────────────────────────────────┴─────────────┐ │
│  │                 upload_to_supabase.py                              │ │
│  │            model.json + metadata → Supabase Storage              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Frontend Layer                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                         React Components                                 ││
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────────────────┐││
│  │  │  StockChart    │ │ PredictionPanel│ │ CompanySelector             │││
│  │  │  (TradingView) │ │ (TensorFlow.js)│ │ (Filters)                  │││
│  │  └───────┬────────┘ └───────┬────────┘ └─────────────┬──────────────┘││
│  │          │                  │                          │                ││
│  │          └──────────────────┼──────────────────────────┘                ││
│  │                             │                                           ││
│  │  ┌──────────────────────────▼──────────────────────────────────────┐   ││
│  │  │                     Custom Hooks                                  │   ││
│  │  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────────────┐ │   ││
│  │  │  │ useModelLoader│ │ usePrediction  │ │ useStockData           │ │   ││
│  │  │  │ (TF.js model) │ │ (inference)    │ │ (Supabase + Finnhub)  │ │   ││
│  │  │  └────────────────┘ └────────────────┘ └────────────────────────┘ │   ││
│  │  └───────────────────────────────────────────────────────────────────┘   ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                     │                                       │
├─────────────────────────────────────┼───────────────────────────────────────┤
│                              API Layer │                                     │
├─────────────────────────────────────▼───────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                       Next.js API Routes                                 ││
│  │                                                                          ││
│  │  ┌────────────────────┐    ┌────────────────────┐    ┌────────────────┐ ││
│  │  │   /api/companies  │    │   /api/prices      │    │ /api/finnhub   │ ││
│  │  │   GET (list)      │    │   GET (history)   │    │   /quote       │ ││
│  │  │   Filters:       │    │   Params:         │    │   GET (proxy)  │ ││
│  │  │   - sector       │    │   - ticker        │    │                │ ││
│  │  │   - country      │    │   - date range    │    │ Server-only:   │ ││
│  │  │   - exchange     │    │   - limit         │    │ FINNHUB_KEY   │ ││
│  │  │   - is_distressed│    │                   │    │                │ ││
│  │  └─────────┬────────┘    └─────────┬────────┘    └───────┬────────┘ ││
│  │            │                       │                        │          ││
│  │  ┌─────────┴────────┐    ┌─────────┴────────┐    ┌───────┴────────┐ ││
│  │  │ /api/models       │    │ /api/predictions  │    │ Finnhub API   │ ││
│  │  │   /latest (GET)   │    │   GET (list)      │    │ https://      │ ││
│  │  │                   │    │   POST (create)   │    │ finnhub.io    │ ││
│  │  └───────────────────┘    └───────────────────┘    └────────────────┘ ││
│  │                                                                          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                     │                                       │
├─────────────────────────────────────┼───────────────────────────────────────┤
│                         Repository Layer │                                   │
├─────────────────────────────────────▼───────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                     Repository Pattern                                    ││
│  │                                                                          ││
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────────────────┐   ││
│  │  │ CompanyRepo    │ │ PricesRepo     │ │ ModelsRepository           │   ││
│  │  │ - findAll()    │ │ - findByTicker │ │ - getLatestStable()        │   ││
│  │  │ - findPaginated│ │ - findByDateRange│ │ - findByVersion()        │   ││
│  │  │                │ │                │ │                            │   ││
│  │  └───────┬────────┘ └───────┬────────┘ └─────────────┬──────────────┘   ││
│  │          │                  │                          │                  ││
│  │          └──────────────────┼──────────────────────────┘                  ││
│  │                             │                                           ││
│  │  ┌──────────────────────────▼──────────────────────────────────────┐   ││
│  │  │                  Supabase Client                                 │   ││
│  │  │              (Admin + Public clients)                            │   ││
│  │  └───────────────────────────────────────────────────────────────────┘   ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                     │                                       │
├─────────────────────────────────────┼───────────────────────────────────────┤
│                          Data Layer │                                       │
├─────────────────────────────────────▼───────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐         ┌────────────────────────────────────┐   │
│  │     PostgreSQL          │         │           Storage                  │   │
│  │  ┌──────────────────┐  │         │  ┌────────────────────────────┐    │   │
│  │  │ companies       │  │         │  │ models/                    │    │   │
│  │  │ prices          │  │         │  │   model.json               │    │   │
│  │  │ models          │  │         │  │   group1-shard1of1.bin    │    │   │
│  │  │ predictions      │  │         │  │   metadata.json           │    │   │
│  │  └──────────────────┘  │         │  └────────────────────────────┘    │   │
│  └────────────────────────┘         └────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. User Request Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  User    │───▶│  Browser     │───▶│  Next.js API │───▶│  Supabase       │
│  clicks  │    │  (React)     │    │  Route       │    │  PostgreSQL     │
└──────────┘    └──────────────┘    └──────┬───────┘    └──────────────────┘
                                           │
                    ┌──────────────────────┘
                    │ If external API needed
                    ▼
            ┌──────────────┐    ┌──────────────────┐
            │ Finnhub API  │    │ Alpha Vantage    │
            │ (Quotes)     │    │ (Historical)     │
            └──────────────┘    └──────────────────┘
```

### 2. Stock Quote Flow

```
User loads dashboard
        │
        ▼
Browser → GET /api/finnhub/quote?symbol=ASML.AS
        │
        ▼
Next.js API Route (server-side)
        │
        ├── Reads FINNHUB_API_KEY from environment
        ├── Calls Finnhub API with API key
        │
        ▼
Finnhub API returns quote data
        │
        ▼
Next.js transforms response
        │
        ▼
Browser receives standardized quote
        │
        ▼
React updates UI with real-time price
```

### 3. Prediction Flow

```
User selects a stock
        │
        ▼
Browser → GET /api/prices?ticker=ASML.AS
        │
        ▼
Supabase returns historical prices
        │
        ▼
FeatureExtractor normalizes prices using Z-score params
        │
        ▼
ModelService.predict() runs TensorFlow.js inference
        │
        ▼
Prediction displayed (direction + confidence)
        │
        ▼
User can log prediction via POST /api/predictions
```

### 4. Model Loading Flow

```
User navigates to prediction panel
        │
        ▼
useModelLoader hook triggered
        │
        ▼
GET /api/models/latest
        │
        ├── Returns model metadata
        ├── Includes Z-score parameters
        │
        ▼
ZScoreNormalizer.setParams() called
        │
        ▼
TensorFlow.js loads model from storage URL
        │
        ▼
Model warmup (dummy inference)
        │
        ▼
Model ready for predictions
```

---

## ML Pipeline Architecture

### Training Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Local Python Pipeline                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐      ┌─────────────────┐      ┌────────────────────────┐
│ data_fetcher   │─────▶│feature_engineer │─────▶│     train_lstm        │
│                │      │                 │      │                        │
│ Input:         │      │ Input:          │      │ Input:                 │
│ - ALPHA_KEY    │      │ - Raw CSVs      │      │ - training_panel.h5   │
│                │      │                 │      │                        │
│ Output:        │      │ Output:         │      │ Output:                │
│ - 45 CSV files │      │ - training_panel│      │ - tfjs_model/         │
│   (20+ years)  │      │ - zscore_params │      │   ├── model.json      │
│                │      │ - features_hash │      │   ├── weights.bin      │
│ ~2 min         │      │                 │      │ - metadata.json        │
│                │      │ ~1 min          │      │                        │
└────────────────┘      └─────────────────┘      │ ~10-30 min (GPU)       │
                                                  └───────────┬────────────┘
                                                              │
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │validation_suite        │
                                                  │                        │
                                                  │ Checks:                │
                                                  │ - Data leakage         │
                                                  │ - NaN handling         │
                                                  │ - Z-score params       │
                                                  │ - Distress balance     │
                                                  └───────────┬────────────┘
                                                              │
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │upload_to_supabase     │
                                                  │                        │
                                                  │ 1. Upload model.json   │
                                                  │ 2. Upload weights.bin  │
                                                  │ 3. Insert metadata     │
                                                  │ 4. Set as stable       │
                                                  └────────────────────────┘
```

### Browser Inference Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Browser Inference                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐      ┌──────────────────┐      ┌────────────────────────┐
│ Raw Price Data  │─────▶│ FeatureExtractor │─────▶│ ZScoreNormalizer       │
│                 │      │                  │      │                        │
│ Input:          │      │ Extracts:        │      │ Normalizes:            │
│ [{date, close,  │      │ - Returns        │      │ (x - mean) / std       │
│   volume, ...}] │      │   60 timesteps   │      │                        │
│                 │      │ - 12 features    │      │ Input:                 │
│                 │      │                  │      │ - Feature vector       │
│                 │      │ Output:          │      │ - Z-score params       │
│                 │      │ - 60x12 array   │      │                        │
│                 │      │                  │      │ Output:                │
│                 │      │                  │      │ - Normalized features  │
└─────────────────┘      └──────────────────┘      └───────────┬────────────┘
                                                              │
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │ TensorFlow.js Model    │
                                                  │                        │
                                                  │ Architecture:          │
                                                  │ Input(60, 12)          │
                                                  │   └─ LSTM(64)          │
                                                  │       └─ Dropout       │
                                                  │           └─ LSTM(32)  │
                                                  │               └─ Dense │
                                                  │                   └─ 1  │
                                                  │                        │
                                                  │ Output:                │
                                                  │ - Probability (0-1)    │
                                                  └───────────┬────────────┘
                                                              │
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │ Prediction Post-Process│
                                                  │                        │
                                                  │ If prob > 0.55: UP    │
                                                  │ If prob < 0.45: DOWN  │
                                                  │ Else: NEUTRAL         │
                                                  │                        │
                                                  │ Confidence = |prob-0.5│×2│
                                                  └────────────────────────┘
```

---

## Security Model

### API Key Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Security Architecture                                │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │           Browser (Client)           │
                    │                                      │
                    │  ❌ Cannot access FINNHUB_API_KEY     │
                    │  ❌ Cannot access ALPHA_VANTAGE_KEY  │
                    │  ❌ Cannot access SUPABASE_ADMIN_KEY │
                    │                                      │
                    │  ✅ Can access NEXT_PUBLIC_SUPABASE_* │
                    │  ✅ Can access NEXT_PUBLIC_MODEL_PATH │
                    └─────────────────────┬─────────────────┘
                                          │
                                          │ API Request
                                          │ (no API key)
                                          ▼
                    ┌─────────────────────────────────────┐
                    │         Next.js API Route            │
                    │                                      │
                    │  ✅ Reads FINNHUB_API_KEY from env   │
                    │  ✅ Adds key to Finnhub request       │
                    │  ✅ Returns sanitized response        │
                    └─────────────────────┬─────────────────┘
                                          │
                                          │ Proxied Request
                                          │ (with API key)
                                          ▼
                    ┌─────────────────────────────────────┐
                    │         External APIs                │
                    │  - Finnhub                          │
                    │  - Alpha Vantage                    │
                    └─────────────────────────────────────┘
```

### Environment Variable Security

| Variable | Exposure | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase admin |
| `FINNHUB_API_KEY` | Server-only | Finnhub quotes |
| `ALPHA_VANTAGE_API_KEY` | Server-only | Historical data |
| `NEXT_PUBLIC_MODEL_PATH` | Public | Model location |

### Row Level Security (RLS)

All tables have RLS policies:

| Table | Public Read | Public Write | Service Role |
|-------|-------------|--------------|--------------|
| companies | ✅ | ❌ | Full |
| prices | ✅ | ❌ | Full |
| models | ✅ | ❌ | Full |
| predictions | ✅ (read) | Authenticated | Full |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    companies    │       │     prices      │       │     models      │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ ticker (PK)     │──┐    │ id (PK)         │       │ id (PK)         │
│ name            │  │    │ ticker (FK)─────┘       │ version (UK)    │
│ exchange        │  │    │ date               │    │ is_stable       │
│ sector          │  │    │ open               │    │ training_date   │
│ country         │  │    │ high               │    │ training_acc.   │
│ is_distressed   │  │    │ low                │    │ distressed_acc. │
│ created_at      │  │    │ close              │    │ zscore_params   │
└─────────────────┘  │    │ adjusted_close    │    │ features_hash   │
                    │    │ volume            │    │ storage_path    │
                    │    └───────────────────┘    │ created_at      │
                    │                            └─────────────────┘
                    │                                     ▲
                    │                                     │
                    └─────────────┐                       │
                                  │                       │
                                  ▼                       │
                    ┌─────────────────┐                   │
                    │  predictions    │───────────────────┘
                    ├─────────────────┤
                    │ id (PK)         │
                    │ ticker (FK)──────┘
                    │ model_version(FK)
                    │ predicted_at
                    │ prediction_window
                    │ predicted_direction
                    │ confidence
                    │ actual_direction
                    │ was_correct
                    │ created_at
                    └─────────────────┘
```

### Table Descriptions

#### companies
Stores metadata for tracked European companies.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ticker | VARCHAR(20) | PRIMARY KEY | Stock symbol (e.g., ASML.AS) |
| name | VARCHAR(100) | NOT NULL | Company name |
| exchange | VARCHAR(10) | NOT NULL | Trading exchange |
| sector | VARCHAR(50) | NOT NULL | Industry sector |
| country | VARCHAR(2) | NOT NULL | ISO country code |
| is_distressed | BOOLEAN | DEFAULT FALSE | Financial distress flag |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

#### prices
Historical OHLCV data for each company.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| ticker | VARCHAR(20) | FK → companies | Stock symbol |
| date | DATE | NOT NULL | Trading date |
| open | DECIMAL(12,4) | | Opening price |
| high | DECIMAL(12,4) | | High price |
| low | DECIMAL(12,4) | | Low price |
| close | DECIMAL(12,4) | | Closing price |
| adjusted_close | DECIMAL(12,4) | | Dividend-adjusted close |
| volume | BIGINT | | Trading volume |

**Unique Constraint:** (ticker, date)

#### models
Trained ML model metadata and parameters.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique ID |
| version | VARCHAR(20) | UNIQUE | Semantic version |
| is_stable | BOOLEAN | DEFAULT FALSE | Production flag |
| training_date | TIMESTAMP | | When trained |
| git_commit_hash | VARCHAR(40) | | Code version |
| training_accuracy | DECIMAL(5,4) | | Overall accuracy |
| distressed_accuracy | DECIMAL(5,4) | | Distressed accuracy |
| zscore_params | JSONB | | Normalization params |
| features_hash | VARCHAR(64) | | Data version |
| storage_path | VARCHAR(255) | | Supabase path |

#### predictions
Prediction logs for tracking vs actual outcomes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| ticker | VARCHAR(20) | FK → companies | Stock symbol |
| model_version | VARCHAR(20) | FK → models | Model used |
| predicted_at | TIMESTAMP | NOT NULL | Prediction time |
| prediction_window_days | INT | DEFAULT 3 | Days predicted |
| predicted_direction | BOOLEAN | NOT NULL | 1=Up, 0=Down |
| confidence | DECIMAL(5,4) | | Model confidence |
| actual_direction | BOOLEAN | | Filled after window |
| was_correct | BOOLEAN | | Computed result |

---

## API Architecture

### Route Structure

```
/api
├── companies/
│   └── route.ts          # GET /api/companies
├── prices/
│   └── route.ts          # GET /api/prices
├── predictions/
│   └── route.ts          # GET, POST /api/predictions
├── finnhub/
│   └── quote/
│       └── route.ts      # GET /api/finnhub/quote
└── models/
    └── latest/
        └── route.ts      # GET /api/models/latest
```

### API Response Format

All responses follow a consistent format:

**Success:**
```json
{
  "data": { ... },
  "metadata": {
    "timestamp": "2026-03-18T12:00:00Z"
  }
}
```

**Error:**
```json
{
  "error": "Error Type",
  "message": "Human-readable message",
  "details": { ... }
}
```

### Caching Strategy

| Endpoint | Cache-Control | Duration |
|----------|--------------|----------|
| `/api/companies` | s-maxage=3600 | 1 hour |
| `/api/prices` | s-maxage=300 | 5 minutes |
| `/api/finnhub/quote` | s-maxage=60 | 1 minute |
| `/api/models/latest` | s-maxage=3600 | 1 hour |
| `/api/predictions` | no-store | No cache |

---

## Performance Considerations

### Client-Side Performance

| Optimization | Implementation |
|-------------|----------------|
| Code Splitting | Next.js automatic |
| Image Optimization | `next/image` |
| Font Optimization | `next/font` |
| Bundle Size | Tree-shaking enabled |
| Model Lazy Loading | `dynamic()` imports |

### Server-Side Performance

| Optimization | Implementation |
|-------------|----------------|
| API Caching | Cache-Control headers |
| Database Indexing | Composite indexes |
| Query Optimization | Select only needed columns |
| Connection Pooling | Supabase handles |

### ML Inference Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Model Size | < 10MB | TF.js format |
| Load Time | < 3s | After warmup |
| Inference Time | < 50ms | Per prediction |
| Memory Usage | < 100MB | Browser heap |

### Database Performance

| Query Type | Index | Expected Time |
|------------|-------|---------------|
| Single ticker prices | idx_prices_ticker_date | < 50ms |
| Companies filter | idx_companies_sector | < 10ms |
| Latest model | idx_models_stable | < 5ms |

---

## Technology Decisions

### Why These Technologies?

#### Next.js 14
- **App Router**: Server Components for reduced client bundle
- **API Routes**: Server-side API key protection
- **Static Generation**: Fast initial page loads
- **Built-in Optimizations**: Image, font, script optimization

#### Supabase
- **Zero-Cost**: 500MB free tier sufficient
- **PostgreSQL**: ACID compliance, JSONB support
- **Row Level Security**: Fine-grained access control
- **Storage**: Model artifact hosting
- **Real-time Ready**: WebSocket support for future

#### TensorFlow.js
- **Browser Inference**: No server compute costs
- **Cross-Platform**: Works on mobile too
- **Model Portability**: Export from Python easily
- **Memory Management**: Automatic tensor cleanup

#### Python Training Pipeline
- **User Control**: No cloud compute costs
- **Flexibility**: Full TensorFlow/Keras support
- **Data Privacy**: Raw data never leaves local machine
- **Reproducibility**: Environment can be versioned

### Alternatives Considered

| Technology | Considered | Rejected Reason |
|------------|------------|-----------------|
| AWS RDS | Yes | Too expensive for free tier |
| Firebase | Yes | No native Python ML support |
| Vercel AI | Yes | Inference costs add up |
| Pyodide | Yes | Performance issues |
| ONNX Runtime | Yes | TF.js more mature for LSTM |

### Trade-offs

| Decision | Trade-off |
|----------|-----------|
| Local Training | User must run Python pipeline |
| Browser Inference | Model size limited by browser |
| Free API tiers | Rate limits on data fetching |
| Supabase free tier | 500MB database limit |

---

## Future Architecture (Potential)

### Scalability Upgrades

1. **Vercel Pro**: Serverless function scaling
2. **Supabase Pro**: Increased storage and bandwidth
3. **GPU Training**: Cloud-based model retraining
4. **Real-time**: WebSocket subscriptions

### Feature Roadmap

1. **Model Retraining**: Scheduled monthly updates
2. **Prediction Sharing**: Social features
3. **Mobile App**: React Native wrapper
4. **Additional Indices**: DAX, CAC 40, FTSE 100

---

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [TensorFlow.js Guide](https://www.tensorflow.org/js)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- [Alpha Vantage API](https://www.alphavantage.co/documentation/)
- [Finnhub API](https://finnhub.io/docs/api)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-18 | Initial architecture documentation |

---

Last updated: 2026-03-18
