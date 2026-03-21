# Data Model Specification

## Purpose

Define Supabase PostgreSQL schema for STOXX-stocks project: company metadata, historical prices, ML model artifacts, and prediction logs.

## Requirements

### Requirement: Companies Table Schema

The system MUST store company metadata for all 45 STOXX 600 training companies.

```sql
CREATE TABLE companies (
  ticker VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  exchange VARCHAR(10) NOT NULL,
  sector VARCHAR(50) NOT NULL,
  country VARCHAR(2) NOT NULL,
  is_distressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Scenario: Company CRUD

- GIVEN no companies exist
- WHEN data_fetcher.py uploads company list
- THEN all 45 companies SHALL be inserted with ticker, name, exchange, sector, country
- AND is_distressed SHALL default to FALSE

#### Scenario: Mark Distressed Company

- GIVEN a company exists with ticker "XYZ"
- WHEN a delisting or bankruptcy event is detected
- THEN is_distressed SHALL be updated to TRUE
- AND predictions for that company SHALL continue to be stored

### Requirement: Prices Table Schema

The system MUST store OHLCV price data with date uniqueness per ticker.

```sql
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
```

#### Scenario: Price Data Insertion

- GIVEN a company ticker "XYZ" exists
- WHEN price data for date 2024-01-15 is fetched
- THEN insert or update (ON CONFLICT) SHALL handle duplicate dates
- AND all OHLCV fields SHALL be populated

### Requirement: Models Table Schema

The system MUST store ML model metadata including normalization parameters.

```sql
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) UNIQUE NOT NULL,
  is_stable BOOLEAN DEFAULT FALSE,
  training_date TIMESTAMP,
  git_commit_hash VARCHAR(40),
  training_accuracy DECIMAL(5,4),
  distressed_accuracy DECIMAL(5,4),
  zscore_params JSONB NOT NULL,
  features_hash VARCHAR(64),
  storage_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Scenario: Model Upload Metadata

- GIVEN a successful LSTM training run
- WHEN upload_to_supabase.py uploads model artifact
- THEN metadata MUST include version, zscore_params, training_accuracy, distressed_accuracy
- AND storage_path SHALL point to Supabase Storage location

#### Scenario: Mark Stable Model

- GIVEN a model version "v1.0.0" exists
- WHEN validation suite passes all checks
- THEN is_stable SHALL be set to TRUE
- AND previous stable models SHALL have is_stable set to FALSE

### Requirement: Predictions Table Schema

The system MUST log all prediction requests for accuracy tracking.

```sql
CREATE TABLE predictions (
  id BIGSERIAL PRIMARY KEY,
  ticker VARCHAR(20) REFERENCES companies(ticker),
  model_version VARCHAR(20) REFERENCES models(version),
  predicted_at TIMESTAMP NOT NULL,
  prediction_window_days INT DEFAULT 3,
  predicted_direction BOOLEAN NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  actual_direction BOOLEAN,
  was_correct BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Scenario: Log New Prediction

- GIVEN ticker "XYZ" and model version "v1.0.0"
- WHEN TensorFlow.js generates prediction (direction=TRUE, confidence=0.72)
- THEN prediction SHALL be logged with predicted_direction, confidence, predicted_at
- AND actual_direction SHALL be NULL until window expires

#### Scenario: Fill Actual Outcome

- GIVEN a prediction exists with id=123, prediction_window_days=3
- WHEN 3 trading days have passed
- THEN a batch job SHALL update actual_direction based on price change
- AND was_correct SHALL be computed (predicted_direction = actual_direction)

## Performance Requirements

| Table | Index | Purpose |
|-------|-------|---------|
| prices | (ticker, date) | Fast historical lookups |
| predictions | (ticker, predicted_at) | Prediction history queries |
| models | (is_stable) | Latest stable model lookup |
