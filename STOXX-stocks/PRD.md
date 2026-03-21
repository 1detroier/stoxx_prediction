# PRD: STOXX-stocks — European Stock Prediction Platform

**Project Type:** Full-Stack Web Application  
**Architecture:** Next.js 14 + Supabase + TensorFlow.js + Local Python Training Pipeline  
**Constraint:** Zero-cost infrastructure (free tiers only)  
**Target:** STOXX 600 companies, starting with top 50  
**Model:** Panel-based LSTM for 3-day binary directional prediction  

---

## 1. Executive Summary

Build a scalable, secure web application to visualize and predict European stock performance using a panel-based LSTM trained on 45 explicitly selected European companies. The system uses local training (user's machine) to avoid token costs and cloud compute, with model artifacts stored in Supabase for client-side inference via TensorFlow.js.

Key Innovation: Distress-aware training (15% distressed companies) to learn failure patterns, not just success patterns.

---

## 2. SDD Phase Triggers

| Phase | Command | Sub-Agent | Output |
|-------|---------|-----------|--------|
| Bootstrap | /sdd-init | Orchestrator | Project context, skill registry |
| Exploration | /sdd-explore architecture | Explorer | Codebase analysis, tech stack validation |
| Proposal | /sdd-new STOXX-stocks | Proposer | Proposal artifact (this PRD) |
| Fast-Forward | /sdd-ff Implementation | Spec Writer, Designer, Task Planner | Spec + Design + Task artifacts |
| Implementation | /sdd-apply | Implementer | Code written, tasks checked |
| Verification | /sdd-verify | Verifier | Validation report |
| Archive | /sdd-archive | Archiver | Change closed, artifacts persisted |

---

## 3. Core Requirements (RFC 2119 Keywords)

### 3.1 Architecture and Constraints

- MUST adhere to SOLID principles: Single Responsibility (separate data/feature/model modules), Open/Closed (interchangeable DataSource interface), Interface Segregation (distinct real-time vs historical interfaces).
- MUST operate under zero-cost constraints: Supabase 500MB free tier, Vercel free tier, client-side inference only.
- MUST use local training pipeline: AI generates code only, user executes all data fetching and model training locally to eliminate token costs.
- MUST support scaling from 10 to 600+ companies without architectural changes (ticker-agnostic schema).

### 3.2 Data Pipeline (Local Execution)

Phase A: Data Acquisition (User-Executed Python)

- MUST fetch Alpha Vantage TIME_SERIES_DAILY_ADJUSTED for 45 explicit tickers (20+ years depth).
- MUST store raw CSVs locally in /data/raw/ (temporary, deleted after training).
- MUST implement rate limiting: 25 requests/minute max (2.4s sleep between calls).
- MUST NOT use Alpha Vantage MCP server (unnecessary abstraction for batch fetching).

Phase B: Feature Engineering (User-Executed Python)

- MUST create features: Z-score normalization (persist mean/std per feature), rolling returns (1m/6m/9m).
- MUST create European-specific features: eur_strength (EUR/USD 20-day correlation), cross_border (revenue &gt;50% outside home country), has_adr (secondary ADR listing), ecb_policy_phase (rate regime).
- MUST create 3D panel tensor: [samples, timesteps, features].
- MUST handle distress cases: 15% of samples from 7 distressed companies, synthetic labels for 3-5 historical delistings (Wirecard, Steinhoff, NMC Health).
- MUST output to /data/processed/training_panel.h5.

Phase C: Model Training (User-Executed Python)

- MUST use panel-based LSTM: 2 layers (64+32 units), dropout 0.2, cross-sectional attention.
- MUST objective: 3-day binary directional classification (1=Up, 0=Down/Maintain).
- MUST implement class balancing for distress cases.
- MUST use time-series split validation (no shuffle), walk-forward validation.
- MUST export to TensorFlow.js: model.json + weights.bin.
- MUST generate metadata: training_date, git_commit_hash, training_accuracy, distressed_accuracy, Z-score params, features_hash (SHA256).

Phase D: Cloud Upload (User-Executed Python)

- MUST upload model.json to Supabase Storage (or Vercel Blob).
- MUST insert metadata row to models table with versioning (latest_stable tag support).
- MUST delete local raw data post-upload; retain only model artifacts.

### 3.3 Training Universe (Explicit 45 Companies)

Geographic Scope: European-domiciled (STOXX 600 eligible), primary listing on European exchange (XETR, XAMS, XPAR, XLON, XSWX, XCSE, XSTO, XMAD, XMIL, XBRU, XDUB, XHEL). ADR listings acceptable if primary is European.

Explicit List (38 Healthy + 7 Distressed):

| Number | Ticker | Company | Exchange | Sector | Status |
|--------|--------|---------|----------|--------|--------|
| 1 | ASML.AS | ASML Holding | XAMS | Technology | Healthy |
| 2 | SAP.DE | SAP | XETR | Technology | Healthy |
| 3 | NOVO-B.CO | Novo Nordisk | XCSE | Healthcare | Healthy |
| 4 | MC.PA | LVMH | XPAR | Consumer Discretionary | Healthy |
| 5 | NESN.SW | Nestle | XSWX | Consumer Staples | Healthy |
| 6 | ROG.SW | Roche | XSWX | Healthcare | Healthy |
| 7 | SIE.DE | Siemens | XETR | Industrials | Healthy |
| 8 | TTE.PA | TotalEnergies | XPAR | Energy | Healthy |
| 9 | AZN.L | AstraZeneca | XLON | Healthcare | Healthy |
| 10 | HSBA.L | HSBC | XLON | Financials | Healthy |
| 11 | SU.PA | Schneider Electric | XPAR | Industrials | Healthy |
| 12 | ALV.DE | Allianz | XETR | Financials | Healthy |
| 13 | SAF.PA | Safran | XPAR | Industrials | Healthy |
| 14 | BNP.PA | BNP Paribas | XPAR | Financials | Healthy |
| 15 | SAN.MC | Santander | XMAD | Financials | Healthy |
| 16 | ULVR.L | Unilever | XLON | Consumer Staples | Healthy |
| 17 | ADYEN.AS | Adyen | XAMS | Technology | Healthy |
| 18 | ABBN.SW | ABB | XSWX | Industrials | Healthy |
| 19 | DSY.PA | Dassault Systemes | XPAR | Technology | Healthy |
| 20 | AIR.PA | Airbus | XPAR | Industrials | Healthy |
| 21 | RR.L | Rolls-Royce | XLON | Industrials | Healthy |
| 22 | ISP.MI | Intesa Sanpaolo | XMIL | Financials | Healthy |
| 23 | INGA.AS | ING | XAMS | Financials | Healthy |
| 24 | CS.PA | AXA | XPAR | Financials | Healthy |
| 25 | OR.PA | L'Oreal | XPAR | Consumer Staples | Healthy |
| 26 | ABI.BR | Anheuser-Busch InBev | XBRU | Consumer Staples | Healthy |
| 27 | GSK.L | GSK | XLON | Healthcare | Healthy |
| 28 | BHP.L | BHP | XLON | Materials | Healthy |
| 29 | SHEL.L | Shell | XLON | Energy | Healthy |
| 30 | IBE.MC | Iberdrola | XMAD | Utilities | Healthy |
| 31 | ENEL.MI | Enel | XMIL | Utilities | Healthy |
| 32 | DTE.DE | Deutsche Telekom | XETR | Telecommunications | Healthy |
| 33 | VOW3.DE | Volkswagen | XETR | Consumer Discretionary | Distressed |
| 34 | TKA.DE | Thyssenkrupp | XETR | Industrials | Distressed |
| 35 | UBI.PA | Ubisoft | XPAR | Technology | Distressed |
| 36 | SINCH.ST | Sinch | XSTO | Technology | Distressed |
| 37 | SDF.DE | K+S | XETR | Materials | Distressed |
| 38 | DBK.DE | Deutsche Bank | XETR | Financials | Distressed |
| 39 | VNA.DE | Vonovia | XETR | Real Estate | Distressed |
| 40 | CRH.L | CRH | XLON | Materials | Healthy |
| 41 | FLTR.L | Flutter Entertainment | XLON | Consumer Discretionary | Healthy |
| 42 | NOKIA.HE | Nokia | XHEL | Technology | Healthy |
| 43 | VOLV-B.ST | Volvo | XSTO | Industrials | Healthy |
| 44 | CARL-B.CO | Carlsberg | XCSE | Consumer Staples | Healthy |
| 45 | KBC.BR | KBC Group | XBRU | Financials | Healthy |

### 3.4 Security and API Architecture

- MUST store Alpha Vantage key in GitHub Secrets (data fetcher) and Finnhub key in Vercel Environment Variables (frontend).
- MUST proxy all external API calls through Next.js API routes (/api/finnhub, /api/alphavantage-proxy for any future server-side needs).
- MUST NOT expose API keys in client-side browser code.
- MUST implement backend proxying to hide keys and mitigate rate-limiting risks.

### 3.5 Database Schema (Supabase)

Ticker-Agnostic Design:

Table: companies (metadata, expandable to 600+)

- ticker: VARCHAR(20) PRIMARY KEY
- name: VARCHAR(100)
- exchange: VARCHAR(10)
- sector: VARCHAR(50)
- country: VARCHAR(2)
- is_distressed: BOOLEAN DEFAULT FALSE
- created_at: TIMESTAMP DEFAULT NOW()

Table: prices (daily, partitioned by ticker)

- id: BIGSERIAL PRIMARY KEY
- ticker: VARCHAR(20) REFERENCES companies(ticker)
- date: DATE NOT NULL
- open: DECIMAL(12,4)
- high: DECIMAL(12,4)
- low: DECIMAL(12,4)
- close: DECIMAL(12,4)
- adjusted_close: DECIMAL(12,4)
- volume: BIGINT
- UNIQUE(ticker, date)

Table: models (model versions with metadata)

- id: UUID PRIMARY KEY DEFAULT gen_random_uuid()
- version: VARCHAR(20) UNIQUE
- is_stable: BOOLEAN DEFAULT FALSE
- training_date: TIMESTAMP
- git_commit_hash: VARCHAR(40)
- training_accuracy: DECIMAL(5,4)
- distressed_accuracy: DECIMAL(5,4)
- zscore_params: JSONB (format: {feature: {mean: x, std: y}})
- features_hash: VARCHAR(64)
- storage_path: VARCHAR(255) (Supabase Storage path)
- created_at: TIMESTAMP DEFAULT NOW()

Table: predictions (predictions log for tracking vs reality)

- id: BIGSERIAL PRIMARY KEY
- ticker: VARCHAR(20) REFERENCES companies(ticker)
- model_version: VARCHAR(20) REFERENCES models(version)
- predicted_at: TIMESTAMP
- prediction_window_days: INT DEFAULT 3
- predicted_direction: BOOLEAN (1=Up, 0=Down)
- confidence: DECIMAL(5,4)
- actual_direction: BOOLEAN (filled after window)
- was_correct: BOOLEAN (computed)
- created_at: TIMESTAMP DEFAULT NOW()

### 3.6 Frontend and Visualization

- MUST use Next.js 14 with TradingView Lightweight Charts.
- MUST implement resolution switching: 60-minute for 5-day view, daily for 1m/6m/1y/5y views.
- MUST fetch transient "Today" prices from Finnhub API (15-min delay) via proxied API route, never stored in Supabase.
- MUST display confidence metrics: Balanced Accuracy (overall + stratified by healthy/distressed), 1-month "Prediction vs Reality" chart.
- MUST display risk metrics: Sharpe Ratio per ticker.
- MUST alert if distressed accuracy &lt;55% (model failure to learn failure patterns).

### 3.7 Model Performance Targets

- SHOULD achieve ~70% Balanced Accuracy on healthy companies.
- SHOULD achieve ~65% Balanced Accuracy on distressed companies (lower acceptable due to noise).
- MUST NOT fall below 55% on distressed companies (random guess = 50%, model must learn something).

---

## 4. Skill Registry (for Sub-Agents)

Skills required for this project:

- nextjs14: Next.js 14 App Router, Server Components, API Routes
- typescript: Strict TypeScript, type-safe API contracts
- supabase: PostgreSQL, Row Level Security, Storage, realtime subscriptions
- tensorflowjs: Client-side model loading, inference, browser-based prediction
- python-data: Pandas, NumPy, feature engineering, HDF5 storage
- tensorflow-python: Keras LSTM, panel data, TimeSeriesSplit, TF.js export
- solid-principles: Single Responsibility, Open/Closed, Interface Segregation
- zero-cost-architecture: Free tier optimization, client-side compute, no server inference
- financial-data: Alpha Vantage API, rate limiting, LOCF imputation, survivorship bias handling
- security: Environment variables, API key proxying, no client-side secrets

---

## 5. Task Breakdown (for Task Planner Sub-Agent)

Phase 1: Foundation

- Initialize Next.js 14 project with TypeScript, Tailwind, ESLint
- Setup Supabase project, run schema SQL, configure RLS
- Configure environment variables template (GitHub Secrets + Vercel)
- Create abstract DataSource interface with Finnhub and Alpha Vantage implementations

Phase 2: Data Pipeline (Local Python)

- Generate data_fetcher.py with 45-ticker list, rate limiting, retry logic
- Generate feature_engineer.py with Z-score, rolling returns, European features
- Generate train_lstm.py with panel-LSTM, distress balancing, TF.js export
- Generate upload_to_supabase.py with model metadata insertion
- Generate validation_suite.py with data leakage checks, NaN handling

Phase 3: Backend API

- Implement /api/finnhub/quote proxy route (15-min delayed, transient)
- Implement /api/companies route (list companies from Supabase)
- Implement /api/prices route (historical data from Supabase)
- Implement /api/predict route (serve model.json for client inference)

Phase 4: Frontend

- Build dashboard layout with TradingView Lightweight Charts
- Implement resolution switcher (5-day/1m/6m/1y/5y)
- Build company selector with sector/country filters
- Display prediction panel with confidence score
- Build "Prediction vs Reality" validation chart (1-month lookback)
- Display Sharpe Ratio and other risk metrics

Phase 5: Integration and Polish

- Wire frontend to Supabase for historical data
- Wire frontend to Finnhub proxy for live quotes
- Load TF.js model from Supabase Storage, run inference in browser
- Add loading states, error boundaries, empty states
- Responsive design, dark mode support

Phase 6: Documentation and Handoff

- Document local training workflow for user
- Document environment setup (API keys, Supabase credentials)
- Create troubleshooting guide for common errors
- Archive change with /sdd-archive

---

## 6. Engram Persistence Rules

MUST persist in Engram (mem_save):

- Architectural decisions (local training vs cloud, ADR inclusion rule)
- SOLID implementation patterns (DataSource interface definition)
- Z-score normalization parameters (mean/std per feature for inference consistency)
- Training universe composition (45 tickers, distress rationale)
- Security protocols (proxy strategy, key management)

MUST NOT persist in Engram:

- Raw stock prices or OHLCV data
- Trained model weights (stored in Supabase Storage)
- User-specific API keys or credentials

---

## 7. Verification Checklist (for Verifier Sub-Agent)

CRITICAL items:

- All 45 tickers fetchable from Alpha Vantage (no delistings since PRD creation)
- API keys never exposed in client-side bundle (check webpack output)
- Z-score params persisted and loaded correctly (inference matches training distribution)
- Distress companies constitute 15% of training samples (not 0%, not 50%)

WARNING items:

- Rate limiting implemented (no 429 errors in logs)
- LOCF imputation does not create look-ahead bias (fundamentals lagged correctly)

SUGGESTION items:

- Add feature importance visualization (SHAP values or permutation importance)
- Add model retraining trigger (monthly or when accuracy drops)

---

## 8. Commands Reference for OpenCode

Setup:

git clone https://github.com/Gentleman-Programming/agent-teams-lite.git
cd agent-teams-lite
./scripts/setup.sh --opencode

Bootstrap project:

/sdd-init
mem_save: "STOXX-stocks: Local training pipeline, 45 European companies (38H+7D), zero-cost, TensorFlow.js client inference"

Explore architecture:

/sdd-explore "Next.js 14 + Supabase + TensorFlow.js architecture for financial prediction"

Start development:

/sdd-new "STOXX-stocks"
/sdd-ff "Implementation"
/sdd-apply
/sdd-verify
/sdd-archive

---

End of PRD