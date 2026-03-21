# STOXX-stocks Architecture & Implementation Notes

**Project**: STOXX-stocks  
**Created**: 2026-03-18  
**Topic Key**: STOXX-stocks/architecture

---

## Architecture Decisions

### 1. Local Training Pipeline
**Decision**: User executes Python scripts locally  
**Rationale**: Eliminates cloud token/API costs  
**Location**: `training/` directory with Python pipeline

### 2. Client-Side TensorFlow.js Inference
**Decision**: Model runs in browser, not server-side  
**Rationale**: Reduces server load, zero inference costs per prediction  
**Implementation**: TensorFlow.js loaded in React components

### 3. DataSource Strategy Pattern
**Decision**: Abstract interface with multiple implementations  
**Implementations**:
| Source | Purpose | Location |
|--------|---------|----------|
| Finnhub | Live market data | `src/lib/datasources/finnhub.ts` |
| Alpha Vantage | Historical data | `src/lib/datasources/alphaVantage.ts` |
| LocalCache | Data persistence | `src/lib/datasources/cache.ts` |

### 4. Z-Score Normalization
**Decision**: Persist mean/std per feature for inference consistency  
**Files**: Generated during training, loaded at inference  
**Critical**: Same normalization params used for training and prediction

### 5. Distress-Aware Training
**Decision**: Include distressed companies in training data  
**Details**: 7 distressed companies (15% of training data)  
**Warning**: Distress ratio warning logged but not strictly enforced in `feature_engineer.py`

### 6. API Key Proxying
**Decision**: All external APIs proxied through `/api` routes  
**Rationale**: Hides API keys from client exposure  
**Implementation**: Server-side only via `process.env`

---

## Implementation Notes

### Tech Stack
| Component | Technology | Notes |
|-----------|------------|-------|
| Framework | Next.js 14 | App Router enabled |
| Database | Supabase | Repository pattern, RLS enabled |
| Charts | TradingView Lightweight Charts | Dynamic import (`ssr: false`) |
| ML Inference | TensorFlow.js | Browser-based |
| Training | Python/TensorFlow | Local execution |

### Design Patterns
| Pattern | Usage | Location |
|---------|-------|----------|
| Repository | Supabase data access | `src/lib/repositories/` |
| Strategy | DataSource implementations | `src/lib/datasources/` |
| Singleton | ModelService | `src/lib/services/ModelService.ts` |

### ModelService Configuration
```
Cache TTL: 5 minutes
Auto-disposal: Enabled
Model format: TensorFlow.js (.json + .bin)
```

### Feature Engineering (12 Technical Features)
| # | Feature | Description |
|---|---------|-------------|
| 1 | returns_1m | 1-month returns |
| 2 | returns_6m | 6-month returns |
| 3 | returns_9m | 9-month returns |
| 4 | volatility_20d | 20-day volatility |
| 5 | volatility_60d | 60-day volatility |
| 6 | rsi_14 | RSI-14 indicator |
| 7 | macd | MACD indicator |
| 8 | macd_signal | MACD signal line |
| 9 | bollinger_position | Bollinger Band position |
| 10 | momentum | Price momentum |
| 11 | sma_20_ratio | 20-day SMA ratio |
| 12 | sma_50_ratio | 50-day SMA ratio |

### Directory Structure
```
Stocks_prediction/
├── src/                    # Frontend (Next.js)
│   ├── app/
│   │   └── api/           # API routes (server-side)
│   ├── components/         # React components
│   └── lib/
│       ├── datasources/   # Strategy implementations
│       ├── repositories/  # Supabase access
│       └── services/      # Business logic
├── training/              # Python training pipeline
│   ├── data/
│   ├── notebooks/
│   └── scripts/
├── supabase/              # Database schema & migrations
└── docs/                  # Documentation
```

---

## Security Implementation

### API Key Management
```
✅ FINNHUB_API_KEY: Server-side only (process.env)
✅ ALPHA_VANTAGE_KEY: Server-side only (process.env)
✅ Client: Uses anon key only via @supabase/ssr
```

### Supabase Security
| Layer | Implementation |
|-------|----------------|
| Authentication | Supabase Auth (SSR client) |
| Authorization | Row Level Security (RLS) policies |
| API | Anon key for client, service key for server |

### Client-Server Boundary
```
Client → /api routes → External APIs (keys hidden)
Client → /api routes → Supabase (RLS enforced)
```

---

## Known Issues

| # | Issue | Severity | Workaround |
|---|-------|----------|------------|
| 1 | Distress ratio warning not enforced | Low | Manual validation |
| 2 | No test suite configured | Medium | Manual testing required |
| 3 | Model training not executed | High | Run `training/scripts/train.py` locally |

---

## Migration Notes

### From STOXX to Production
1. **Model Training**: Execute `python training/scripts/train.py`
2. **Export Model**: TensorFlow.js format to `public/models/`
3. **Deploy Normalization**: Copy `normalization_params.json` to `public/`
4. **Database Setup**: Run Supabase migrations in `supabase/migrations/`
5. **Environment**: Configure production API keys in Vercel/env

---

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- Finnhub API: `https://finnhub.io/docs/api`
- Alpha Vantage: `https://www.alphavantage.co/documentation/`
