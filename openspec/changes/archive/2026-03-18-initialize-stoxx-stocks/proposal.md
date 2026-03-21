# Proposal: Initialize STOXX-Stocks Project

## Intent

Build a zero-cost, scalable web application to visualize and predict European stock performance using a panel-based LSTM trained on 45 explicitly selected European companies. The system trains locally on the user's machine to avoid token costs and cloud compute, with model artifacts stored in Supabase for client-side inference via TensorFlow.js.

## Scope

### In Scope
- **Foundation**: Next.js 14 + TypeScript + Tailwind, Supabase schema, env configuration
- **Data Pipeline** (Local Python): Data fetcher, feature engineering (Z-score, rolling returns), LSTM training with distress balancing, Supabase upload, validation suite
- **Backend API Routes**: Finnhub quote proxy, companies list, historical prices, model serving
- **Frontend Dashboard**: TradingView charts, resolution switcher (5d/1m/6m/1y/5y), company selector with filters, prediction panel with confidence metrics, validation chart, Sharpe Ratio display
- **ML Integration**: TensorFlow.js client-side inference, Z-score normalization, Supabase Storage for model artifacts

### Out of Scope
- Direct Alpha Vantage API calls from frontend
- Server-side ML inference
- Additional STOXX 600 companies beyond initial 45
- Mobile native apps
- Real-time streaming quotes (15-min delay acceptable)

## Approach

- **Architecture**: Next.js 14 App Router (Server Components for initial data, Client Components for charts/inference)
- **ML Strategy**: Local Python pipeline → Supabase Storage → TensorFlow.js browser inference
- **Data Flow**: Alpha Vantage → Local Python (fetch/feature-engineer/train) → Supabase → Next.js API → Frontend
- **Phases**: Foundation (1-2d) → Data Pipeline (2-3d) → Backend API (1-2d) → Frontend (3-4d) → Integration (2-3d) → Polish (1-2d)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/` | New | Next.js app structure |
| `src/app/api/` | New | API routes (finnhub, companies, prices, predict) |
| `src/components/` | New | Dashboard, charts, prediction panel |
| `scripts/` | New | Python data pipeline (fetcher, trainer, uploader) |
| `supabase/` | New | Schema migrations |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Alpha Vantage rate limits (25 req/min) | High | 2.4s sleep between calls |
| Model accuracy < 70% healthy / 65% distressed | Medium | Distress balancing, synthetic labels for delistings |
| Supabase 500MB storage limit exceeded | Low | Delete raw data post-upload |
| API key exposure in client bundle | Low | Server-side proxy, Vercel env vars |

## Rollback Plan

- Feature flags for ML model loading
- Graceful degradation to static data if Supabase unavailable
- Fallback to cached model if Supabase Storage fails
- Git revert for any failed phase

## Dependencies

- Alpha Vantage API key (free tier)
- Supabase account (free tier)
- Finnhub API key (free tier)

## Success Criteria

- [ ] Balanced accuracy ≥ 70% on healthy companies
- [ ] Balanced accuracy ≥ 65% on distressed companies
- [ ] Zero API key exposures in client bundle
- [ ] All 45 tickers fetchable and trainable
- [ ] Dashboard loads in < 3 seconds on 3G
