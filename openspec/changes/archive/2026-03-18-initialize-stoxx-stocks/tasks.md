# Tasks: Initialize STOXX-Stocks Project

## Phase 1: Foundation

- [x] 1.1 Initialize Next.js 14: `npx create-next-app@latest . --typescript --tailwind --eslint --app`
- [x] 1.2 Configure `tailwind.config.ts` with financial dark theme colors (#131722, #1e222d)
- [x] 1.3 Set up path aliases in `tsconfig.json` (`@/` → `./src/`)
- [x] 1.4 Install deps: `@supabase/supabase-js @tensorflow/tfjs lightweight-charts`
- [x] 1.5 Create `.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY`
- [x] 1.6 Run `npm run build` — verify clean build
- [x] 1.7 Create `supabase/schema.sql` — companies, prices, models, predictions tables + indexes
- [x] 1.8 Configure RLS policies on all tables (service role full access)
- [x] 1.9 Create Supabase Storage bucket `models/`
- [x] 1.10 Create `supabase/seed.sql` with 45 STOXX 600 tickers
- [x] 1.11 Verify: `SELECT COUNT(*) FROM companies` returns 45
- [x] 1.12 Create `src/app/layout.tsx` with ThemeProvider and QueryProvider
- [x] 1.13 Add Inter font via `next/font/google`

## Phase 2: Backend API Routes

- [ ] 2.1 Create `src/lib/supabase/server.ts` — Supabase client with service role
- [ ] 2.2 Create `src/lib/repositories/CompanyRepository.ts` — list with sector/country/distress/search filters
- [ ] 2.3 Create `src/app/api/companies/route.ts` — GET with 1hr cache headers
- [ ] 2.4 Create `src/lib/repositories/PricesRepository.ts` — date range + resolution (daily/60min)
- [ ] 2.5 Create `src/app/api/prices/route.ts` — GET with ticker/start/end/resolution params
- [ ] 2.6 Create `src/app/api/finnhub/quote/route.ts` — proxy with FINNHUB_API_KEY from env, 5s timeout
- [ ] 2.7 Create `src/app/api/models/latest/route.ts` — return latest stable model with zscore_params
- [ ] 2.8 Create `src/app/api/predictions/route.ts` — POST logging to predictions table
- [ ] 2.9 Test: GET `/api/companies` → 45 companies; GET `/api/prices?ticker=ASML.AS` → prices; GET `/api/finnhub/quote?symbol=ASML:NL` → quote

## Phase 3: Frontend Components

- [ ] 3.1 Create `src/components/dashboard/CompanySelector.tsx` — grid with ticker, name, exchange badge, sector, country flag
- [ ] 3.2 Create `src/components/dashboard/FilterBar.tsx` — sector dropdown, country dropdown, status toggle, search input
- [ ] 3.3 Create `src/components/dashboard/DashboardPage.tsx` — compose FilterBar + CompanySelector
- [ ] 3.4 Create `src/components/charts/PriceChart.tsx` — integrate TradingView Lightweight Charts, dark theme
- [ ] 3.5 Create `src/components/charts/ResolutionSwitcher.tsx` — 5d/1m/6m/1y/5y button group
- [ ] 3.6 Wire resolution logic: 5d → 60min bars; 1m+ → daily bars
- [ ] 3.7 Create `src/components/predictions/PredictionPanel.tsx` — direction arrow + confidence bar + model version badge
- [ ] 3.8 Create `src/components/predictions/DirectionIndicator.tsx` — up/down/neutral arrows (green/red/gray)
- [ ] 3.9 Create `src/components/predictions/ConfidenceMeter.tsx` — progress bar 0–100%
- [ ] 3.10 Create `src/components/predictions/AccuracyDisplay.tsx` — healthy/distressed accuracy + warning if distressed < 55%
- [ ] 3.11 Create `src/components/metrics/RiskMetrics.tsx` — Sharpe Ratio calculation from daily returns
- [ ] 3.12 Create `src/components/ui/LoadingSpinner.tsx`, `ErrorBoundary.tsx`, `Alert.tsx`, `ChartSkeleton.tsx`

## Phase 4: ML Integration

- [ ] 4.1 Create `src/lib/ml/ModelService.ts` — load model.json from Supabase Storage URL, apply Z-score normalization, predict(), dispose()
- [ ] 4.2 Wire `PredictionPanel` → `ModelService` → display prediction after model loads
- [ ] 4.3 Fetch `zscore_params` from `/api/models/latest` before inference
- [ ] 4.4 Create `src/components/charts/PredictionRealityChart.tsx` — fetch predictions from `/api/predictions`, color-code correct (green) vs incorrect (red), show 30-day rolling accuracy

## Phase 5: Data Pipeline (Local Python — user executes)

- [ ] 5.1 Create `scripts/data_fetcher.py` — 45-ticker list, Alpha Vantage, 2.4s sleep rate limit, retry with exponential backoff, save to `data/raw/*.json`
- [ ] 5.2 Create `scripts/feature_engineer.py` — Z-score normalization (persist mean/std), rolling returns (1d/5d/20d), volatility, volume_ratio, save `data/zscore_params.json`
- [ ] 5.3 Create `scripts/train_lstm.py` — panel LSTM (64+32 units, dropout 0.2), cross-sectional attention, distress balancing, walk-forward validation, export TensorFlow.js format
- [ ] 5.4 Create `scripts/upload_to_supabase.py` — upload model artifacts to Supabase Storage, insert metadata row, bulk insert prices, delete raw data
- [ ] 5.5 Create `scripts/validation_suite.py` — temporal leakage check, NaN check, feature range ±5σ, label balance, model shape, output JSON report
- [ ] 5.6 Test: Run full pipeline locally; verify validation passes with accuracy targets (>70% healthy, >65% distressed)

## Phase 6: Integration & Polish

- [ ] 6.1 Wire Finnhub quote → `/api/finnhub/quote` → quote display above chart
- [ ] 6.2 Wire PriceChart → `/api/prices` → chart redraws on resolution change
- [ ] 6.3 Handle Finnhub failures → display "Price temporarily unavailable" banner + last Supabase close
- [ ] 6.4 Wire CompanySelector → `/api/companies` → real-time filtering
- [ ] 6.5 Add ErrorBoundary to all components — graceful degradation on errors
- [ ] 6.6 Test responsive layout: 375px (mobile), 768px (tablet), 1024px (desktop)
- [ ] 6.7 Lazy load TradingView chart with `next/dynamic`
- [ ] 6.8 Add loading skeletons — ChartSkeleton during price fetch
- [ ] 6.9 Verify: Page load < 3s on 3G (Lighthouse)
- [ ] 6.10 Verify: No API keys in client bundle (`NEXT_PUBLIC_` only for public vars)

## Phase 7: Documentation

- [ ] 7.1 Write `README.md` — setup, Supabase config, env vars, local training workflow, API endpoints
- [ ] 7.2 Write `docs/troubleshooting.md` — Alpha Vantage rate limits, Supabase connection, model loading failures, chart rendering issues

---

## Dependency Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 6 → Phase 7
                ↑                                      ↓
            Phase 5 (independent — user runs locally)  ↓
                                                   Phase 7
```

## Verification Checklist

- [ ] All 45 companies visible in dashboard
- [ ] Price charts render with all 5 resolutions (5d/1m/6m/1y/5y)
- [ ] Live Finnhub quotes display (or graceful "unavailable" banner)
- [ ] Prediction shows direction + confidence + model version
- [ ] Distress alert shows when distressed accuracy < 55%
- [ ] Prediction vs Reality chart shows 30-day history with color-coded correct/incorrect
- [ ] Sharpe Ratio calculates and displays
- [ ] Model achieves training targets (>70% healthy, >65% distressed)
- [ ] Zero API key exposure in client bundle
