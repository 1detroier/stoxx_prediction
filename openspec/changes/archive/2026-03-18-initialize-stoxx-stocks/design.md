# Design: Initialize STOXX-Stocks Project

## Technical Approach

Build a zero-cost European stock prediction platform using Next.js 14 for the frontend/API, Supabase for storage, and TensorFlow.js for client-side inference. The ML pipeline trains locally (user's machine) to avoid cloud compute costs, exporting to TensorFlow.js format for browser-based predictions.

## Architecture Decisions

### Decision: Client-Side ML Inference

**Choice**: TensorFlow.js runs predictions in browser using model artifacts from Supabase Storage  
**Alternatives considered**: Server-side Python inference (Lambda/Cloud Functions), pre-computed predictions stored in DB  
**Rationale**: Eliminates server compute costs, reduces latency (no round-trip), scales infinitely with user base

### Decision: Strategy Pattern for Data Sources

**Choice**: `IStockDataSource` interface with `FinnhubDataSource` and `AlphaVantageDataSource` implementations  
**Alternatives considered**: Direct API calls scattered in components, single hardcoded DataSource  
**Rationale**: Open/Closed principle — swap data sources without changing consumers; enables testing with mocks

### Decision: Z-Score Normalization with Persisted Parameters

**Choice**: Store mean/std per feature in `models.zscore_params` (JSONB), apply normalization client-side during inference  
**Alternatives considered**: Runtime-only normalization, server-side normalization endpoint  
**Rationale**: Ensures inference uses identical distribution as training; client-side avoids extra API call per prediction

### Decision: Repository Pattern for Data Access

**Choice**: `CompanyRepository`, `PricesRepository`, `ModelsRepository`, `PredictionsRepository` wrapping Supabase client  
**Alternatives considered**: Direct Supabase calls in API routes, ORM with business logic  
**Rationale**: Single Responsibility — data access isolated from API logic; enables future backend swap without API changes

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LOCAL PYTHON PIPELINE                             │
│  Alpha Vantage → data_fetcher.py → /data/raw/*.csv                      │
│         ↓                                                                  │
│  feature_engineer.py → Z-score params + /data/processed/training_panel.h5│
│         ↓                                                                  │
│  train_lstm.py → TensorFlow.js export (model.json + weights.bin)         │
│         ↓                                                                  │
│  upload_to_supabase.py → Supabase Storage + models table                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS BACKEND                                │
│  API Routes: /api/companies, /api/prices, /api/finnhub/quote,           │
│              /api/models/latest, /api/predictions                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER CLIENT                                 │
│  TensorFlow.js loads model from Supabase Storage                         │
│  Z-score params fetched from /api/models/latest                         │
│  Prediction runs locally: normalized_features → LSTM → direction/confidence│
└─────────────────────────────────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `STOXX-stocks/app/layout.tsx` | Create | Root layout with providers |
| `STOXX-stocks/app/page.tsx` | Create | Dashboard home (Server Component) |
| `STOXX-stocks/app/companies/page.tsx` | Create | Company list page |
| `STOXX-stocks/app/stock/[ticker]/page.tsx` | Create | Individual stock page |
| `STOXX-stocks/app/api/companies/route.ts` | Create | GET /api/companies |
| `STOXX-stocks/app/api/prices/route.ts` | Create | GET /api/prices |
| `STOXX-stocks/app/api/finnhub/quote/route.ts` | Create | GET /api/finnhub/quote (proxied) |
| `STOXX-stocks/app/api/models/latest/route.ts` | Create | GET /api/models/latest |
| `STOXX-stocks/app/api/predictions/route.ts` | Create | POST /api/predictions |
| `STOXX-stocks/components/dashboard/CompanySelector.tsx` | Create | Company dropdown with filters |
| `STOXX-stocks/components/dashboard/CompanyCard.tsx` | Create | Company info card |
| `STOXX-stocks/components/charts/PriceChart.tsx` | Create | TradingView Lightweight Charts |
| `STOXX-stocks/components/charts/ResolutionSwitcher.tsx` | Create | 5d/1m/6m/1y/5y switcher |
| `STOXX-stocks/components/predictions/PredictionPanel.tsx` | Create | Direction + confidence display |
| `STOXX-stocks/components/metrics/RiskMetrics.tsx` | Create | Sharpe Ratio, risk metrics |
| `STOXX-stocks/lib/datasources/IStockDataSource.ts` | Create | DataSource interface |
| `STOXX-stocks/lib/datasources/FinnhubDataSource.ts` | Create | Finnhub implementation |
| `STOXX-stocks/lib/repositories/CompanyRepository.ts` | Create | Company data access |
| `STOXX-stocks/lib/repositories/PricesRepository.ts` | Create | Price data access |
| `STOXX-stocks/lib/repositories/ModelsRepository.ts` | Create | Model metadata access |
| `STOXX-stocks/lib/ml/ModelService.ts` | Create | TF.js loading + inference |
| `STOXX-stocks/lib/ml/ZScoreNormalizer.ts` | Create | Z-score normalization |
| `STOXX-stocks/lib/supabase/client.ts` | Create | Browser Supabase client |
| `STOXX-stocks/lib/supabase/server.ts` | Create | Server Supabase client |
| `STOXX-stocks/training/data_fetcher.py` | Create | Alpha Vantage data fetcher |
| `STOXX-stocks/training/feature_engineer.py` | Create | Z-score, rolling returns, European features |
| `STOXX-stocks/training/train_lstm.py` | Create | Panel LSTM training + TF.js export |
| `STOXX-stocks/training/upload_to_supabase.py` | Create | Upload artifacts to Supabase |
| `STOXX-stocks/training/validation_suite.py` | Create | Data leakage + quality checks |
| `STOXX-stocks/training/requirements.txt` | Create | Python dependencies |
| `STOXX-stocks/supabase/schema.sql` | Create | PostgreSQL schema with RLS |
| `STOXX-stocks/supabase/seed.sql` | Create | 45 companies seed data |
| `STOXX-stocks/.env.example` | Create | Environment variable template |

## Interfaces / Contracts

### TypeScript Interfaces

```typescript
// lib/datasources/IStockDataSource.ts
export interface IStockDataSource {
  getQuote(symbol: string): Promise<FinnhubQuote>;
  getHistoricalPrices(symbol: string, range: DateRange): Promise<Price[]>;
  searchCompanies(query: string): Promise<Company[]>;
}

// lib/ml/types.ts
export interface ZScoreParams {
  [feature: string]: { mean: number; std: number };
}

export interface Prediction {
  direction: 'UP' | 'DOWN';
  confidence: number;
}

// API Response Types
export interface CompaniesResponse {
  companies: Company[];
  total: number;
}

export interface PricesResponse {
  ticker: string;
  prices: Price[];
}
```

### API Contracts

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/companies` | GET | `?sector=&country=&is_distressed=&search=` | `CompaniesResponse` |
| `/api/prices` | GET | `?ticker=&start_date=&end_date=` | `PricesResponse` |
| `/api/finnhub/quote` | GET | `?symbol=ASML:XN` | `FinnhubQuote` |
| `/api/models/latest` | GET | — | `ModelMetadata` |
| `/api/predictions` | POST | `{ticker, model_version, predicted_direction, confidence}` | `{id, ticker, predicted_at}` |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | ZScoreNormalizer, formatters, calculations | Jest with mock data |
| Integration | API routes with Supabase | Mock Service Worker + test DB |
| E2E | Full prediction flow | Playwright: select company → view chart → run prediction |

## Migration / Rollout

Phased implementation (10 days total):

1. **Phase 1 (2d)**: Foundation — Next.js setup, Supabase schema, env config
2. **Phase 2 (3d)**: Data Pipeline — Python scripts for fetch/feature/train/upload
3. **Phase 3 (2d)**: Backend API — All 5 API routes with RLS policies
4. **Phase 4 (3d)**: Frontend — Dashboard, charts, prediction panel
5. **Phase 5 (1d)**: Polish — Error boundaries, loading states, responsive design

No database migration required (greenfield project).

## Open Questions

- [ ] Should prediction outcome tracking (actual_direction) be automated via cron job or manual?
- [ ] Acceptable model load time threshold? (Consider lazy-loading vs preloading)
