# STOXX-stocks Architecture Exploration Report

## Executive Summary

**Project:** European Stock Prediction Platform  
**Stack:** Next.js 14 + Supabase + TensorFlow.js + Local Python Training  
**Status:** Greenfield (no source code yet)  
**Constraint:** Zero-cost infrastructure (free tiers only)

This exploration validates the technical architecture for a financial prediction platform that uses client-side ML inference with a local Python training pipeline.

---

## 1. Tech Stack Validation

### 1.1 Next.js 14 App Router ✅ APPROPRIATE

| Requirement | Validation | Recommendation |
|-------------|------------|----------------|
| Server Components | ✅ Ideal for initial data fetch | Use for company lists, historical prices |
| API Routes | ✅ Needed for Finnhub proxy | Implement in `/app/api/finnhub/` |
| Streaming | ⚠️ Consider for chart data | Use Suspense boundaries for TradingView charts |
| Edge Runtime | ⚠️ TensorFlow.js needs Node | Keep API routes on Node runtime |

**Recommended Pattern:**
```
app/
├── page.tsx                    # Server Component for initial data
├── components/
│   ├── Chart.tsx              # Client Component (TradingView)
│   └── PredictionPanel.tsx    # Client Component (TF.js)
└── api/
    └── finnhub/
        └── quote/route.ts     # Proxy route
```

### 1.2 TypeScript Strict Mode ✅ REQUIRED

```json
// tsconfig.json requirements
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Financial Type Safety Requirements:**
- Strict decimal handling for OHLCV data
- Date/Timezone consistency (UTC for storage, local for display)
- Union types for prediction outcomes: `PredictionDirection = 'UP' | 'DOWN'`

### 1.3 Tailwind Configuration ✅ STANDARD

- Use CSS custom properties for chart colors
- Dark mode support via `class` strategy
- Custom colors for bullish (green) / bearish (red) indicators

---

## 2. Architecture Patterns

### 2.1 DataSource Interface Pattern (Strategy)

```typescript
// interfaces/DataSource.ts
interface IStockDataSource {
  getQuote(ticker: string): Promise<Quote>;
  getHistoricalDaily(ticker: string, outputSize?: 'compact' | 'full'): Promise<OHLCV[]>;
  getIntraday(ticker: string, interval: '1min' | '5min' | '15min' | '60min'): Promise<OHLCV[]>;
}

// implementations/
├── FinnhubDataSource.ts      // Real-time (15-min delayed)
└── AlphaVantageDataSource.ts // Historical batch
```

**Pattern Benefits:**
- Interchangeable providers (Finnhub ↔ Alpha Vantage)
- Easy to add mock/stub for testing
- Single responsibility per implementation

### 2.2 Repository Pattern for Supabase

```typescript
// repositories/CompanyRepository.ts
class CompanyRepository {
  constructor(private supabase: SupabaseClient) {}
  
  async findAll(filters?: CompanyFilters): Promise<Company[]>;
  async findByTicker(ticker: string): Promise<Company | null>;
  async upsert(companies: Company[]): Promise<void>;
}

// repositories/PricesRepository.ts
class PricesRepository {
  async getHistorical(ticker: string, range: DateRange): Promise<Price[]>;
  async getLatest(ticker: string): Promise<Price | null>;
}
```

**Why Repository Pattern:**
- Encapsulates Supabase client usage
- Easy to mock in tests
- Centralizes query logic for optimization

### 2.3 Service Layer for ML

```typescript
// services/ModelService.ts
class ModelService {
  private model: tf.LayersModel | null = null;
  private zscoreParams: Map<string, { mean: number; std: number }>;
  
  async loadModel(storagePath: string): Promise<void>;
  async predict(features: number[][]): Promise<PredictionResult>;
  normalizeWithZScore(data: number[], feature: string): number[];
}
```

**Loading Strategy:**
```typescript
// Option A: Load on mount (simpler)
useEffect(() => { modelService.loadModel(path); }, []);

// Option B: Preload on hover (better UX per React best practices)
const preloadModel = () => import('./model-loader');
<button onMouseEnter={preloadModel}>Predict</button>
```

---

## 3. Database Schema Analysis

### 3.1 Supabase Schema Review

```sql
-- companies table: ticker-agnostic design for 600+ scalability
CREATE TABLE companies (
  ticker VARCHAR(20) PRIMARY KEY,  -- PK on ticker, not surrogate
  name VARCHAR(100) NOT NULL,
  exchange VARCHAR(10) NOT NULL,
  sector VARCHAR(50),
  country VARCHAR(2),
  is_distressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- prices table: partitioned by ticker (via query optimization)
CREATE TABLE prices (
  id BIGSERIAL PRIMARY KEY,
  ticker VARCHAR(20) REFERENCES companies(ticker),
  date DATE NOT NULL,
  open DECIMAL(12,4),
  high DECIMAL(12,4),
  low DECIMAL(12,4),
  close DECIMAL(12,4),
  adjusted_close DECIMAL(12,4),
  volume BIGINT,
  UNIQUE(ticker, date)
);

-- Index for efficient date range queries
CREATE INDEX idx_prices_ticker_date ON prices(ticker, date DESC);
```

### 3.2 Row Level Security (RLS) Implications

```sql
-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- Public read access for companies/prices
CREATE POLICY "Public read companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Public read prices" ON prices FOR SELECT USING (true);

-- Service role for model uploads (no public insert)
-- Alpha Vantage fetcher uploads via service role key
CREATE POLICY "Service role insert prices" ON prices 
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

### 3.3 Real-time Subscriptions

```typescript
// Realtime for live quotes (Finnhub WebSocket → Supabase Realtime)
const channel = supabase
  .channel('quotes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'prices', filter: `ticker=eq.${ticker}` },
    (payload) => handlePriceUpdate(payload.new)
  )
  .subscribe();
```

**⚠️ RLS Concern:** Public subscriptions may expose quote data. Consider:
- Finnhub quotes NOT stored (transient)
- Historical prices are public anyway
- Real-time updates via Finnhub WebSocket directly (bypassing Supabase Realtime)

---

## 4. Security Review

### 4.1 API Key Proxying

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│   Client    │───▶│ Next.js API │───▶│    Finnhub      │
│  (Browser) │    │   Route     │    │   (API Key)     │
└─────────────┘    └─────────────┘    └─────────────────┘
                      │
                      │ Keys stored in:
                      │ - Vercel ENV vars (Finnhub)
                      │ - GitHub Secrets (Alpha Vantage)
```

**Implementation:**
```typescript
// app/api/finnhub/quote/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('symbol');
  
  // Validate input
  if (!ticker || !/^[A-Z.-]+$/.test(ticker)) {
    return Response.json({ error: 'Invalid ticker' }, { status: 400 });
  }
  
  // Proxy with key (never expose to client)
  const apiKey = process.env.FINNHUB_API_KEY;
  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
  );
  
  return Response.json(await response.json());
}
```

### 4.2 Environment Variable Handling

| Variable | Location | Access |
|----------|----------|--------|
| `FINNHUB_API_KEY` | Vercel ENV | Server-side only |
| `ALPHA_VANTAGE_KEY` | GitHub Secrets | CI/CD for local training |
| `SUPABASE_URL` | Vercel ENV | Client OK (public) |
| `SUPABASE_ANON_KEY` | Vercel ENV | Client OK (RLS protected) |

**Critical Rule:** Supabase anon key ≠ unrestricted access. RLS policies enforce data access rules.

### 4.3 Client vs Server Boundaries

```typescript
// ✅ SAFE: Server Component
async function CompanyPage({ params }) {
  const companies = await supabase.from('companies').select();
  return <CompanyList data={companies} />;
}

// ✅ SAFE: Client Component for interactivity
'use client';
export function ChartComponent({ data }) {
  const [hoveredPrice, setHoveredPrice] = useState(null);
  // TradingView library requires client context
  return <TradingViewChart onHover={setHoveredPrice} />;
}

// ✅ SAFE: TF.js inference in Client Component
'use client';
export function PredictionPanel() {
  const runInference = async (features) => {
    const model = await tf.loadLayersModel(modelUrl);
    const prediction = model.predict(features);
    // ...
  };
}
```

---

## 5. Performance Considerations

### 5.1 TensorFlow.js Model Loading

```typescript
// Optimization: Cache model in memory
const modelCache = new Map<string, tf.LayersModel>();

export async function loadModel(path: string): Promise<tf.LayersModel> {
  if (modelCache.has(path)) {
    return modelCache.get(path)!;
  }
  
  const model = await tf.loadLayersModel(path);
  modelCache.set(path, model);
  return model;
}
```

**Memory Management:**
```typescript
// Dispose model when component unmounts
useEffect(() => {
  return () => {
    model?.dispose();
  };
}, []);
```

### 5.2 TradingView Chart Optimization

Per React Best Practices (AGENTS.md):

```typescript
// ❌ BAD: Creating chart on every render
function Chart({ data }) {
  const ref = useRef<HTMLDivElement>();
  useEffect(() => {
    const chart = new Chart(ref.current, { data }); // Recreated!
  });
  return <div ref={ref} />;
}

// ✅ GOOD: Create once, update data
const chartRef = useRef<chartType>();

useEffect(() => {
  if (!chartRef.current) {
    chartRef.current = createChart(containerRef.current, options);
  }
  chartRef.current.update(ohlcvData); // Efficient update
}, []);

// ✅ BETTER: Hoist static options
const CHART_OPTIONS = {
  layout: { background: { color: '#1a1a2e' }, textColor: '#e0e0e0' },
  grid: { vertLines: { color: '#2d2d44' }, horzLines: { color: '#2d2d44' } },
  // ...
};
```

### 5.3 Supabase Query Optimization

```typescript
// ❌ BAD: Fetch all prices, filter in JS
const { data } = await supabase
  .from('prices')
  .select('*');
const filtered = data.filter(p => p.ticker === ticker);

// ✅ GOOD: Filter at database level
const { data } = await supabase
  .from('prices')
  .select('*')
  .eq('ticker', ticker)
  .gte('date', startDate)
  .lte('date', endDate)
  .order('date', { ascending: true })
  .limit(5000); // Prevent runaway queries
```

---

## 6. Zero-Cost Constraints Analysis

### 6.1 Supabase 500MB Free Tier

| Resource | Usage | Monthly Quota |
|----------|-------|---------------|
| Database Storage | ~50KB per ticker × 45 × 7300 days ≈ 15MB | 500MB |
| Model Storage | 1-5MB per model.json + weights.bin | Separate Storage bucket |
| Bandwidth | Supabase hosted tier | 2GB/mo free |

**Optimization Strategies:**
- Use `adjusted_close` only (not raw close) to avoid duplicate data
- Compress historical data older than 10 years (archive table)
- Model weights stay in Storage bucket (separate from database)

### 6.2 Vercel Free Tier

| Resource | Usage | Limit |
|----------|-------|-------|
| Serverless Functions | API routes | 100K requests/mo |
| Edge Functions | Middleware | 100K requests/mo |
| Bandwidth | API responses | 100GB/mo |
| Build Time | CI/CD | 6K minutes/mo |

**Optimization Strategies:**
- Cache Finnhub responses (15-min delay anyway): `Cache-Control: public, max-age=900`
- Batch company list into single query (not per-company)
- Lazy-load TF.js model (not on initial page load)

---

## 7. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Alpha Vantage rate limits | High | Medium | Implement 2.4s sleep, exponential backoff |
| Model accuracy degradation | Medium | High | Monthly validation, retraining trigger |
| Supabase storage overflow | Low | High | Monitor usage, archive old data |
| Finnhub WebSocket disconnects | Medium | Low | Auto-reconnect, stale data indicator |
| Browser OOM on large models | Low | High | Progressive loading, memory cleanup |
| Z-score mismatch (training vs inference) | High | Critical | Persist params in models table, validate on load |

### Critical: Z-Score Parameter Management

```typescript
// Fetch zscore params with model
const { data: model } = await supabase
  .from('models')
  .select('*, zscore_params')
  .eq('is_stable', true)
  .single();

// Validate params loaded
if (!model.zscore_params || Object.keys(model.zscore_params).length === 0) {
  throw new Error('Model missing Z-score parameters');
}
```

---

## 8. Skill Recommendations for Sub-Agents

Based on PRD Section 4:

| Skill | Priority | When Needed |
|-------|----------|-------------|
| `nextjs14` | CRITICAL | All frontend work |
| `typescript` | CRITICAL | All TypeScript files |
| `supabase` | HIGH | Backend API, database |
| `tensorflowjs` | HIGH | Prediction panel, model loading |
| `python-data` | HIGH | Local training pipeline (Phase B) |
| `tensorflow-python` | HIGH | LSTM model training (Phase C) |
| `solid-principles` | MEDIUM | DataSource interface design |
| `zero-cost-architecture` | MEDIUM | Supabase/Vercel optimization |
| `financial-data` | MEDIUM | Alpha Vantage integration |
| `security` | HIGH | API key proxying |

---

## 9. Recommended Project Structure

```
STOXX-stocks/
├── app/
│   ├── page.tsx                    # Main dashboard
│   ├── layout.tsx                   # Root layout with providers
│   ├── globals.css                  # Tailwind + custom styles
│   ├── api/
│   │   └── finnhub/
│   │       └── quote/route.ts       # Finnhub proxy
│   └── companies/
│       └── [ticker]/page.tsx       # Company detail page
├── components/
│   ├── charts/
│   │   ├── PriceChart.tsx           # TradingView wrapper
│   │   └── PredictionChart.tsx      # Validation chart
│   ├── panels/
│   │   ├── PredictionPanel.tsx       # TF.js inference
│   │   └── MetricsPanel.tsx         # Sharpe, accuracy
│   └── ui/                          # Shadcn/ui components
├── lib/
│   ├── datasources/
│   │   ├── interface.ts             # IStockDataSource
│   │   ├── finnhub.ts
│   │   └── alphavantage.ts
│   ├── repositories/
│   │   ├── companies.ts
│   │   ├── prices.ts
│   │   └── models.ts
│   ├── services/
│   │   └── modelService.ts          # TF.js loading + inference
│   └── supabase/
│       └── client.ts
├── training/                        # Local Python pipeline
│   ├── data_fetcher.py
│   ├── feature_engineer.py
│   ├── train_lstm.py
│   └── upload_to_supabase.py
├── supabase/
│   └── schema.sql                   # Database schema
├── types/
│   └── index.ts                     # Shared TypeScript types
└── .env.local                       # Local development keys
```

---

## 10. Exploration Summary

### Status
✅ **Ready for Proposal**

### Key Findings
1. **Greenfield project** — no existing code to analyze
2. **Architecture well-defined in PRD** — strategy pattern, repository pattern appropriate
3. **Zero-cost constraints realistic** — 500MB Supabase, 100K Vercel requests sufficient
4. **Critical risk: Z-score parameter management** — must persist with model metadata

### Next Steps
1. **Create proposal** (sdd-propose) with architecture decisions documented
2. **Initialize project** (sdd-init) with Next.js 14 template
3. **Begin Phase 1** foundation work per PRD Section 5

### Artifacts to Persist
Per PRD Section 6:
- DataSource interface definition
- Z-score normalization parameters (once determined)
- Training universe composition (45 tickers)
- Security protocols (proxy strategy)

---

*Generated: 2026-03-18*  
*Project: STOXX-stocks*  
*Phase: Exploration*
