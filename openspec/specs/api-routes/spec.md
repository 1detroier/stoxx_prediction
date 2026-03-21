# API Routes Specification

## Purpose

Define Next.js API routes for STOXX-stocks backend: company data, price history, Finnhub proxy, model metadata, and prediction logging.

## Requirements

### Requirement: GET /api/companies

The system MUST return company list with optional filtering.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| sector | string | No | Filter by sector (Technology, Healthcare, etc.) |
| country | string | No | Filter by 2-letter country code |
| is_distressed | boolean | No | Filter by distress status |
| search | string | No | Search in ticker/name |

**Response:**
```json
{
  "companies": [
    {
      "ticker": "ASML",
      "name": "ASML Holding",
      "exchange": "XAMS",
      "sector": "Technology",
      "country": "NL",
      "is_distressed": false
    }
  ]
}
```

**Caching:** MUST cache for 1 hour (Cache-Control header).

#### Scenario: Filter by Sector

- GIVEN user requests /api/companies?sector=Technology
- THEN response SHALL contain only Technology sector companies
- AND count SHALL reflect filtered results

#### Scenario: Search Companies

- GIVEN user requests /api/companies?search=asml
- THEN response SHALL include companies matching "asml" in ticker or name (case-insensitive)

### Requirement: GET /api/prices

The system MUST return historical OHLCV data from Supabase.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| ticker | string | Yes | Company ticker symbol |
| start_date | string | No | ISO date (YYYY-MM-DD) |
| end_date | string | No | ISO date (YYYY-MM-DD) |
| resolution | string | No | "daily" (default) or "60min" |

**Response:**
```json
{
  "prices": [
    {
      "date": "2024-01-15",
      "open": 720.50,
      "high": 725.00,
      "low": 718.25,
      "close": 723.80,
      "adjusted_close": 723.80,
      "volume": 2500000
    }
  ]
}
```

#### Scenario: Fetch Daily Prices

- GIVEN ticker "ASML" and no date range
- THEN response SHALL return last 365 days of daily prices
- AND sorted by date ascending

#### Scenario: Fetch Date-Range Prices

- GIVEN ticker "ASML", start_date="2024-01-01", end_date="2024-03-31"
- THEN response SHALL contain prices only within that range
- AND missing trading days SHALL be excluded

### Requirement: GET /api/finnhub/quote

The system MUST proxy Finnhub API for live quotes (15-min delayed).

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| symbol | string | Yes | Ticker symbol (e.g., "ASML:XN") |

**Response:**
```json
{
  "symbol": "ASML:XN",
  "price": 723.50,
  "change": 2.70,
  "changePercent": 0.37,
  "timestamp": 1705320000
}
```

#### Scenario: Successful Quote Fetch

- GIVEN symbol "ASML:XN"
- WHEN Finnhub API returns valid data
- THEN response SHALL include price, change, changePercent, timestamp

#### Scenario: Finnhub API Failure

- GIVEN symbol "ASML:XN"
- WHEN Finnhub API returns error or times out (>5s)
- THEN response SHALL return HTTP 502
- AND error message SHALL indicate Finnhub unavailable
- AND MUST NOT expose API key

### Requirement: GET /api/models/latest

The system MUST return metadata for the current stable model.

**Response:**
```json
{
  "version": "v1.0.0",
  "is_stable": true,
  "training_date": "2024-01-15T00:00:00Z",
  "training_accuracy": 0.72,
  "distressed_accuracy": 0.68,
  "zscore_params": {
    "mean": [...],
    "std": [...],
    "feature_order": ["return_1d", "return_5d", ...]
  },
  "storage_path": "models/lstm_v1.0.0/model.json"
}
```

#### Scenario: Get Latest Stable Model

- GIVEN at least one model with is_stable=TRUE exists
- THEN response SHALL return the most recent stable model
- AND zscore_params SHALL be included for client-side inference

### Requirement: POST /api/predictions

The system MUST log prediction requests to Supabase.

**Request Body:**
```json
{
  "ticker": "ASML",
  "model_version": "v1.0.0",
  "predicted_direction": true,
  "confidence": 0.72
}
```

**Response:**
```json
{
  "id": 12345,
  "ticker": "ASML",
  "predicted_at": "2024-01-15T10:30:00Z",
  "prediction_window_days": 3
}
```

#### Scenario: Log Prediction

- GIVEN valid prediction payload
- WHEN request is authenticated (internal only)
- THEN prediction SHALL be inserted into predictions table
- AND id SHALL be returned

## Security Requirements

- MUST NOT expose Finnhub API key in response headers
- MUST validate ticker exists in companies table
- MUST rate limit /api/finnhub/quote (client-side: minimum 1s between requests)
- SHOULD use service role key for Supabase queries in API routes
