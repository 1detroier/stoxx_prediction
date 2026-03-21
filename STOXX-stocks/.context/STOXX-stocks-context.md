# STOXX-stocks Project Context

## Project Overview
- **Name**: STOXX-stocks
- **Purpose**: European stock prediction platform for STOXX 600 companies
- **Stack**: Next.js 14 + TypeScript + Tailwind + Supabase + TensorFlow.js
- **Date Created**: 2026-03-18

## Architecture Decisions

### 1. Local Training Pipeline
User executes Python scripts locally → eliminates token costs
- data_fetcher.py: Alpha Vantage fetching (45 tickers, 2.4s rate limit)
- feature_engineer.py: Z-score normalization, rolling returns, European features
- train_lstm.py: Panel LSTM (64→32 units), TensorFlow.js export
- upload_to_supabase.py: Upload model to Supabase Storage
- validation_suite.py: Data leakage checks

### 2. Client-Side TensorFlow.js Inference
Model runs in browser, not server-side
- Zero-cost infrastructure (no server compute)
- ModelService singleton with 5-min cache TTL
- Memory cleanup with tf.dispose()

### 3. DataSource Strategy Pattern
Abstract interface with Finnhub (live) and Alpha Vantage (historical) implementations

### 4. Z-Score Normalization
Persist mean/std per feature for inference consistency
- zscore_params JSONB in models table
- Loaded from /api/models/latest on app start

### 5. Distress-Aware Training
7 distressed companies (15% of training data)
- VOW3.DE, TKA.DE, UBI.PA, SINCH.ST, SDF.DE, DBK.DE, VNA.DE
- Synthetic labels for Wirecard, Steinhoff, NMC Health

### 6. API Key Proxying
All external APIs proxied through /api routes
- FINNHUB_API_KEY only in process.env (server-side)
- ALPHA_VANTAGE_API_KEY only in training scripts (local)

## Tech Stack

### Frontend
- Next.js 14 App Router
- TypeScript (strict mode)
- Tailwind CSS (dark theme)
- TradingView Lightweight Charts
- React Query/SWR for data fetching

### Backend
- Next.js API Routes
- Supabase PostgreSQL
- Supabase Storage (models)
- Row Level Security (RLS)

### ML Pipeline
- Python 3.9+
- TensorFlow 2.15+
- Pandas, NumPy
- TensorFlow.js converter

## 45 Training Universe

### Healthy Companies (38)
ASML.AS, SAP.DE, NOVO-B.CO, MC.PA, NESN.SW, ROG.SW, SIE.DE, TTE.PA, AZN.L, HSBA.L, SU.PA, ALV.DE, SAF.PA, BNP.PA, SAN.MC, ULVR.L, ADYEN.AS, ABBN.SW, DSY.PA, AIR.PA, RR.L, ISP.MI, INGA.AS, CS.PA, OR.PA, ABI.BR, GSK.L, BHP.L, SHEL.L, IBE.MC, ENEL.MI, DTE.DE, CRH.L, FLTR.L, NOKIA.HE, VOLV-B.ST, CARL-B.CO, KBC.BR

### Distressed Companies (7)
VOW3.DE (Volkswagen), TKA.DE (Thyssenkrupp), UBI.PA (Ubisoft), SINCH.ST (Sinch), SDF.DE (K+S), DBK.DE (Deutsche Bank), VNA.DE (Vonovia)

## File Structure

```
STOXX-stocks/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── companies/route.ts
│   │   │   ├── prices/route.ts
│   │   │   ├── finnhub/quote/route.ts
│   │   │   ├── models/latest/route.ts
│   │   │   └── predictions/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── dashboard/ (CompanySelector, CompanyCard, FilterBar)
│   │   ├── charts/ (PriceChart, ResolutionSwitcher, PredictionRealityChart)
│   │   ├── predictions/ (PredictionPanel, DirectionIndicator, ConfidenceMeter)
│   │   ├── metrics/ (RiskMetrics, SharpeRatio)
│   │   └── ui/ (LoadingSpinner, ErrorBoundary, Alert, Card, Toast)
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── repositories/ (Company, Prices, Models, Predictions)
│   │   └── ml/ (ModelService, ZScoreNormalizer, FeatureExtractor)
│   ├── hooks/ (usePrediction, useModelLoader, useApiCall)
│   └── types/index.ts
├── training/
│   ├── data_fetcher.py
│   ├── feature_engineer.py
│   ├── train_lstm.py
│   ├── upload_to_supabase.py
│   ├── validation_suite.py
│   └── requirements.txt
├── supabase/
│   ├── schema.sql (tables: companies, prices, models, predictions)
│   └── seed.sql (45 companies)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── TRAINING.md
└── .env (actual keys)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/companies | GET | List companies with filters |
| /api/prices | GET | Get price history for a ticker |
| /api/finnhub/quote | GET | Proxy for Finnhub quote API |
| /api/models/latest | GET | Get latest stable ML model |
| /api/predictions | GET/POST | List or create predictions |

## Setup Status

### Completed ✅
- [x] Next.js project initialized
- [x] TypeScript configuration
- [x] Tailwind dark theme
- [x] All API routes implemented
- [x] Frontend components created
- [x] Supabase schema (need to run)
- [x] Supabase seed (need to run)
- [x] Python training pipeline
- [x] Documentation

### Pending ⏳
- [ ] Run Supabase schema.sql
- [ ] Run Supabase seed.sql
- [ ] Train ML model (local Python)
- [ ] Upload model to Supabase

## Known Issues

1. **Distress ratio warning**: Displayed when distressed accuracy < 55%
2. **No test suite**: Manual testing required before production
3. **Model training not executed**: User must run Python pipeline locally

## Environment Variables

Actual keys in: `STOXX-stocks/.env`
Placeholder templates in: `STOXX-stocks/.env.example`

Required:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- FINNHUB_API_KEY
- ALPHA_VANTAGE_API_KEY
- NEXT_PUBLIC_MODEL_PATH

## Next Steps (For Next Session)

1. Run Supabase setup:
   ```bash
   cd STOXX-stocks
   npx supabase login
   npx supabase link --project-ref benjuctbaimbxpxqigst
   npx supabase db push
   # OR manually run schema.sql then seed.sql in Supabase dashboard
   ```

2. Train model locally:
   ```bash
   cd STOXX-stocks/training
   pip install -r requirements.txt
   cp .env.example .env  # Add your API keys
   python data_fetcher.py
   python feature_engineer.py
   python train_lstm.py
   python upload_to_supabase.py
   ```

3. Run dev server:
   ```bash
   npm run dev
   ```

## Verification Results

- Build: ✅ Passed
- Lint: ✅ Passed
- API key security: ✅ Compliant
- 45 tickers seeded: ✅ Compliant
- Z-score persistence: ✅ Compliant
