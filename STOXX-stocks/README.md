# STOXX-stocks — European Stock Prediction Platform

A full-stack web application for visualizing and predicting European stock performance using a panel-based LSTM model trained on STOXX 600 companies.

**Architecture:** Next.js 14 + TypeScript + Tailwind + Supabase + TensorFlow.js  
**Constraint:** Zero-cost infrastructure (free tiers only)  
**Target:** 45 European companies (38 healthy + 7 distressed)  
**Model:** Panel-based LSTM for 3-day binary directional prediction

---

## Features

### Core Functionality
- **Stock Dashboard**: Interactive charts powered by TradingView Lightweight Charts
- **Real-time Quotes**: 15-minute delayed prices via Finnhub API proxy
- **Price History**: 20+ years of historical data from Supabase
- **ML Predictions**: Client-side TensorFlow.js inference for 3-day directional prediction
- **Prediction Tracking**: Log predictions vs actual outcomes for validation

### Technical Highlights
- **Local Training Pipeline**: Python scripts for data fetching, feature engineering, and model training
- **Z-score Normalization**: Consistent feature scaling for accurate inference
- **Distress-Aware Training**: 15% of samples from distressed companies to learn failure patterns
- **API Key Security**: All external API keys proxied through Next.js API routes
- **Row-Level Security**: Supabase RLS policies for data protection

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 14 | App Router, Server Components |
| Language | TypeScript 5 | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| Database | Supabase | PostgreSQL + Storage |
| ML Inference | TensorFlow.js | Browser-based prediction |
| ML Training | Python + TensorFlow | Local model training |
| Data Sources | Alpha Vantage, Finnhub | Stock prices & quotes |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase account
- Finnhub API key ([finnhub.io](https://finnhub.io))
- Alpha Vantage API key ([alphavantage.co](https://www.alphavantage.co))

### 1. Clone and Install

```bash
git clone <repository-url>
cd STOXX-stocks
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FINNHUB_API_KEY=your_finnhub_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
NEXT_PUBLIC_MODEL_PATH=/models/latest/model.json
```

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Run `supabase/seed.sql` in SQL Editor
4. Create a public storage bucket named `models`

See [SETUP.md](./SETUP.md) for detailed instructions.

### 4. Train the Model

```bash
cd training
python data_fetcher.py --output ../data/raw
python feature_engineer.py --input ../data/raw --output ../data/processed
python train_lstm.py --input ../data/processed --output ../public/models
python upload_to_supabase.py --model-dir ../public/models
```

See [docs/TRAINING.md](./docs/TRAINING.md) for the complete training workflow.

### 5. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

---

## Project Structure

```
STOXX-stocks/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── companies/      # GET /api/companies
│   │   │   ├── prices/         # GET /api/prices
│   │   │   ├── predictions/    # GET,POST /api/predictions
│   │   │   ├── finnhub/        # Finnhub proxy
│   │   │   └── models/         # Model metadata
│   │   ├── page.tsx            # Dashboard home
│   │   ├── layout.tsx          # Root layout
│   │   └── globals.css         # Global styles
│   ├── components/             # React components
│   │   ├── charts/             # TradingView chart components
│   │   ├── dashboard/          # Dashboard layout components
│   │   ├── metrics/            # Performance metric displays
│   │   ├── predictions/        # Prediction-related components
│   │   └── ui/                 # Reusable UI components
│   ├── hooks/                  # Custom React hooks
│   │   ├── useModelLoader.ts   # TensorFlow.js model loading
│   │   └── usePrediction.ts     # Prediction logic
│   ├── lib/                    # Core libraries
│   │   ├── ml/                 # ML utilities
│   │   │   ├── ModelService.ts # TensorFlow.js service
│   │   │   ├── FeatureExtractor.ts
│   │   │   └── ZScoreNormalizer.ts
│   │   ├── repositories/       # Database repositories
│   │   │   ├── CompanyRepository.ts
│   │   │   ├── PricesRepository.ts
│   │   │   ├── ModelsRepository.ts
│   │   │   └── PredictionsRepository.ts
│   │   └── supabase.ts         # Supabase client
│   └── types/                  # TypeScript definitions
│       └── index.ts
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # System architecture
│   ├── API.md                  # API reference
│   └── TRAINING.md             # Training pipeline guide
├── supabase/                   # Database schema
│   ├── schema.sql               # Table definitions + RLS
│   └── seed.sql                 # Initial data (45 companies)
├── training/                   # Python ML pipeline
│   ├── data_fetcher.py          # Alpha Vantage fetcher
│   ├── feature_engineer.py      # Feature engineering
│   ├── train_lstm.py            # LSTM training
│   ├── upload_to_supabase.py    # Model upload
│   ├── validation_suite.py      # Data validation
│   └── README.md                # Training docs
├── public/
│   └── models/                  # Trained model files
├── data/                       # Local training data
│   ├── raw/                     # Raw CSV files (temporary)
│   └── processed/               # Processed training data
├── .env.example                # Environment template
├── next.config.js              # Next.js config
├── tailwind.config.ts          # Tailwind config
├── package.json
├── tsconfig.json
└── README.md                   # This file
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Browser                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Dashboard  │  │    Chart    │  │    Prediction Panel        │ │
│  │  (Next.js)  │  │  (TradingView)│ │   (TensorFlow.js)          │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘ │
└─────────┼────────────────┼──────────────────────┼──────────────────┘
          │                │                      │
          │ GET /api/      │ GET /api/            │ Model Inference
          │ companies,     │ prices, finnhub      │
          │                │                      │
┌─────────▼────────────────▼──────────────────────▼──────────────────┐
│                       Next.js API Routes                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐│
│  │ /api/companies│  │ /api/prices  │  │ /api/finnhub/quote         ││
│  │ /api/models   │  │ /api/predic.  │  │ (API key proxy)            ││
│  └──────┬───────┘  └──────┬───────┘  └──────────────┬─────────────┘│
└─────────┼─────────────────┼─────────────────────────┼──────────────┘
          │                 │                         │
┌─────────▼─────────────────▼─────────────────────────▼──────────────┐
│                          Supabase                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐│
│  │  PostgreSQL  │  │    Storage   │  │     Realtime              ││
│  │  - companies │  │  - models/    │  │  (future)                 ││
│  │  - prices    │  │                │  │                          ││
│  │  - models    │  │                │  │                          ││
│  │  - predictions│  │                │  │                          ││
│  └──────────────┘  └──────────────┘  └────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
          ▲
          │ Model Upload
          │
┌─────────┴───────────────────────────────────────────────────────────┐
│                       Local Python Pipeline                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐│
│  │data_fetcher  │─▶│feature_engin │─▶│train_lstm.py              ││
│  │(Alpha Vantage)│  │(Z-score,     │  │(Panel LSTM)               ││
│  │              │  │ rolling)      │  │                          ││
│  └──────────────┘  └──────────────┘  └──────────────┬─────────────┘│
│                                                     │              │
│                                                     ▼              │
│                              ┌──────────────────────────────────────┐│
│                              │upload_to_supabase.py                  ││
│                              │(Model artifacts + metadata)          ││
│                              └──────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Reference

See [docs/API.md](./docs/API.md) for detailed API documentation.

### Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies` | GET | List companies with filters |
| `/api/prices` | GET | Fetch price history |
| `/api/finnhub/quote` | GET | Get real-time quote (15-min delay) |
| `/api/models/latest` | GET | Get latest stable model metadata |
| `/api/predictions` | GET, POST | Manage predictions |

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Project overview (this file) |
| [SETUP.md](./SETUP.md) | Detailed setup guide |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture |
| [docs/API.md](./docs/API.md) | API endpoint reference |
| [docs/TRAINING.md](./docs/TRAINING.md) | Training pipeline guide |
| [PRD.md](./PRD.md) | Product requirements document |
| [training/README.md](./training/README.md) | Python training scripts |

---

## Training Universe

The model is trained on 45 European companies (38 healthy + 7 distressed):

| Category | Count | Purpose |
|----------|-------|---------|
| Healthy | 38 | Learn normal market patterns |
| Distressed | 7 | Learn failure patterns (Volkswagen, Deutsche Bank, etc.) |

### Distressed Companies

| Ticker | Company | Issue |
|--------|---------|-------|
| VOW3.DE | Volkswagen | Emissions scandal |
| TKA.DE | Thyssenkrupp | Restructuring |
| UBI.PA | Ubisoft | Stock decline |
| SINCH.ST | Sinch | Accounting issues |
| SDF.DE | K+S | Commodity pressure |
| DBK.DE | Deutsche Bank | Legacy issues |
| VNA.DE | Vonovia | Market conditions |

---

## Model Performance Targets

| Metric | Target | Minimum |
|--------|--------|---------|
| Overall Accuracy | ~65% | 55% |
| Healthy Accuracy | ~70% | 60% |
| Distressed Accuracy | ~65% | 55% |

If distressed accuracy falls below 55%, the model is not learning failure patterns effectively.

---

## Security Model

- **API Keys**: Stored server-side only, proxied through Next.js API routes
- **RLS Policies**: Supabase Row Level Security for data access
- **Client Inference**: TensorFlow.js runs entirely in browser
- **No Secrets in Bundle**: Environment variables are never exposed to client

---

## License

MIT License - See project root for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` to check for issues
5. Submit a pull request

---

Last updated: 2026-03-18
