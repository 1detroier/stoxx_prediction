# STOXX-Stocks Master Specification

## Project Overview

| Property | Value |
|----------|-------|
| Name | STOXX-Stocks |
| Stack | Next.js 14 + TypeScript + Tailwind + Supabase + TensorFlow.js |
| Purpose | European stock prediction platform for STOXX 600 companies |
| Scope | 45 training companies, client-side ML inference |

## Domain Specifications

| Domain | File | Purpose |
|--------|------|---------|
| Data Model | [data-model/spec.md](data-model/spec.md) | Supabase schema (companies, prices, models, predictions) |
| API Routes | [api-routes/spec.md](api-routes/spec.md) | Next.js API routes for data serving |
| Frontend | [frontend/spec.md](frontend/spec.md) | UI components, charts, prediction display |
| ML Pipeline | [ml-pipeline/spec.md](ml-pipeline/spec.md) | Python training scripts (Phase A-E) |

## Cross-Cutting Requirements

### Security (RFC 2119)

- MUST proxy all external APIs through /api routes
- MUST NOT expose API keys in client bundle
- MUST use server-side Supabase queries in API routes

### Performance

- Dashboard load: < 3s on 3G
- Chart render (1260 bars): < 500ms
- ML inference: < 2s including model load

### Data Integrity

- Time-series split validation (no shuffle)
- Z-score normalization required for inference
- Raw data MUST be deleted post-Supabase upload

### Availability

- Graceful degradation if Finnhub unavailable
- Graceful degradation if Supabase unavailable
- Feature flags for ML model loading

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Local Python Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│  Alpha Vantage → data_fetcher.py → feature_engineer.py →        │
│  train_lstm.py → upload_to_supabase.py → validation_suite.py   │
└────────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                  │
├──────────────────┬──────────────────┬───────────────────────────┤
│  companies      │  prices          │  models                   │
│  predictions    │  Storage (model artifacts)                   │
└──────────────────┴──────────────────┴───────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js App                                  │
├─────────────────────────────────────────────────────────────────┤
│  API Routes: /api/companies, /api/prices, /api/finnhub/quote    │
│              /api/models/latest, /api/predictions               │
└────────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend Components                           │
├──────────────────┬──────────────────┬───────────────────────────┤
│  Company         │  Price Charts    │  Prediction Panel        │
│  Dashboard       │  (TradingView)   │  (TensorFlow.js)         │
└──────────────────┴──────────────────┴───────────────────────────┘
```

## Success Criteria

- [ ] Balanced accuracy ≥ 70% on healthy companies
- [ ] Balanced accuracy ≥ 65% on distressed companies
- [ ] Zero API key exposures in client bundle
- [ ] All 45 tickers fetchable and trainable
- [ ] Dashboard loads in < 3 seconds on 3G
