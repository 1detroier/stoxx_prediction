# STOXX-stocks API Documentation

Complete API reference for the STOXX-stocks platform.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Rate Limits](#rate-limits)
- [Endpoints](#endpoints)
  - [GET /api/companies](#get-apicompanies)
  - [GET /api/prices](#get-apiprices)
  - [GET /api/finnhub/quote](#get-apifinnhubquote)
  - [GET /api/models/latest](#get-apimodellatest)
  - [GET /api/predictions](#get-apipredictions)
  - [POST /api/predictions](#post-apipredictions)
- [Error Codes](#error-codes)
- [Examples](#examples)

---

## Overview

The STOXX-stocks API is a RESTful API built on Next.js 14 App Router. All endpoints are server-side and proxy external API calls to protect sensitive credentials.

### Base URL

```
https://your-project.supabase.co  (production)
http://localhost:3000              (development)
```

### Response Format

All responses return JSON with consistent structure.

**Success Response:**
```json
{
  "data": { ... },
  "metadata": {
    "timestamp": "2026-03-18T12:00:00Z"
  }
}
```

**Error Response:**
```json
{
  "error": "ErrorType",
  "message": "Human-readable error message",
  "details": { ... }
}
```

---

## Authentication

### Public Endpoints

All endpoints are publicly accessible but respect Row Level Security (RLS) policies:

| Endpoint | Access | Notes |
|----------|--------|-------|
| `GET /api/companies` | Public | Read-only |
| `GET /api/prices` | Public | Read-only |
| `GET /api/finnhub/quote` | Public | Server proxies API key |
| `GET /api/models/latest` | Public | Read-only |
| `GET /api/predictions` | Public | Read-only |
| `POST /api/predictions` | Authenticated | Requires Supabase auth |

### API Keys

The API uses environment variables server-side:

| Variable | Purpose |
|----------|---------|
| `FINNHUB_API_KEY` | Finnhub real-time quotes |
| `ALPHA_VANTAGE_API_KEY` | Historical data (training only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Database admin operations |

These keys are **never exposed** to client-side code.

---

## Rate Limits

### External APIs (Server-Side)

| Service | Tier | Limit |
|---------|------|-------|
| Finnhub | Free | 60 requests/minute |
| Alpha Vantage | Free | 25 requests/minute, 500/day |

### Client Recommendations

Implement throttling on client-side Finnhub calls:

```typescript
// Example: Rate-limited Finnhub fetcher
const RATE_LIMIT = 60; // calls per minute
const INTERVAL = 60000 / RATE_LIMIT; // 1000ms between calls

let lastCall = 0;
async function fetchQuote(symbol: string) {
  const now = Date.now();
  const wait = Math.max(0, INTERVAL - (now - lastCall));
  await new Promise(resolve => setTimeout(resolve, wait));
  lastCall = Date.now();
  
  const response = await fetch(`/api/finnhub/quote?symbol=${symbol}`);
  return response.json();
}
```

---

## Endpoints

### GET /api/companies

Fetch list of tracked companies with optional filters.

**URL:** `GET /api/companies`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sector` | string | - | Filter by sector |
| `country` | string | - | Filter by country code |
| `exchange` | string | - | Filter by exchange |
| `is_distressed` | boolean | - | Filter by distress status |
| `search` | string | - | Search in name/ticker |
| `limit` | number | 50 | Max results (1-100) |
| `offset` | number | 0 | Pagination offset |

**Example Request:**
```bash
# Get all companies
curl "http://localhost:3000/api/companies"

# Get Technology sector
curl "http://localhost:3000/api/companies?sector=Technology"

# Get distressed companies
curl "http://localhost:3000/api/companies?is_distressed=true"

# Search
curl "http://localhost:3000/api/companies?search=asml"

# Paginate
curl "http://localhost:3000/api/companies?limit=10&offset=20"
```

**Example Response:**
```json
{
  "companies": [
    {
      "ticker": "ASML.AS",
      "name": "ASML Holding",
      "exchange": "XAMS",
      "sector": "Technology",
      "country": "NL",
      "is_distressed": false,
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "total": 45,
  "limit": 50,
  "offset": 0
}
```

**Cache-Control:** `public, s-maxage=3600, stale-while-revalidate=600`

---

### GET /api/prices

Fetch historical price data for a ticker.

**URL:** `GET /api/prices`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticker` | string | Yes | Stock symbol (e.g., ASML.AS) |
| `start_date` | string | No | ISO date (YYYY-MM-DD) |
| `end_date` | string | No | ISO date (YYYY-MM-DD) |
| `limit` | number | No | Max results (1-1000, default: 365) |

**Example Request:**
```bash
# Get recent prices for ASML
curl "http://localhost:3000/api/prices?ticker=ASML.AS"

# Get prices for 2024
curl "http://localhost:3000/api/prices?ticker=ASML.AS&start_date=2024-01-01&end_date=2024-12-31"

# Get last 100 days
curl "http://localhost:3000/api/prices?ticker=ASML.AS&limit=100"
```

**Example Response:**
```json
{
  "ticker": "ASML.AS",
  "prices": [
    {
      "id": 12345,
      "ticker": "ASML.AS",
      "date": "2026-03-17",
      "open": 892.50,
      "high": 905.25,
      "low": 888.75,
      "close": 901.50,
      "adjusted_close": 901.50,
      "volume": 1250000
    }
  ],
  "count": 365
}
```

**Cache-Control:** `public, s-maxage=300, stale-while-revalidate=60`

**Error Responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Validation Error | Missing or invalid ticker |
| 500 | Internal Server Error | Database error |

---

### GET /api/finnhub/quote

Get real-time quote for a symbol. Proxies to Finnhub API.

**URL:** `GET /api/finnhub/quote`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock symbol (e.g., ASML.AS) |

**Example Request:**
```bash
curl "http://localhost:3000/api/finnhub/quote?symbol=ASML.AS"
```

**Example Response:**
```json
{
  "symbol": "ASML.AS",
  "price": 901.50,
  "change": 8.25,
  "change_percent": 0.92,
  "timestamp": 1710681600,
  "high": 905.25,
  "low": 888.75,
  "open": 892.50,
  "previous_close": 893.25
}
```

**Cache-Control:** `public, s-maxage=60, stale-while-revalidate=30`

**Notes:**
- Data has 15-minute delay (Finnhub free tier)
- API key is never exposed to client
- Rate limit: 60 requests/minute

---

### GET /api/models/latest

Get the latest stable model metadata and parameters.

**URL:** `GET /api/models/latest`

**Query Parameters:** None

**Example Request:**
```bash
curl "http://localhost:3000/api/models/latest"
```

**Example Response:**
```json
{
  "version": "1.0.0",
  "training_date": "2026-03-01T12:00:00Z",
  "training_accuracy": 0.6785,
  "distressed_accuracy": 0.6532,
  "zscore_params": {
    "returns_1m": { "mean": 0.0012, "std": 0.015 },
    "returns_6m": { "mean": 0.0072, "std": 0.09 },
    "returns_9m": { "mean": 0.0108, "std": 0.135 },
    "volume_ratio": { "mean": 1.0, "std": 0.5 },
    "eur_strength": { "mean": 0.0, "std": 1.0 },
    "cross_border": { "mean": 0.35, "std": 0.48 },
    "has_adr": { "mean": 0.15, "std": 0.36 },
    "ecb_policy_phase": { "mean": 0.0, "std": 1.0 },
    "volatility_1m": { "mean": 0.15, "std": 0.08 },
    "volatility_3m": { "mean": 0.18, "std": 0.10 },
    "momentum_1m": { "mean": 0.005, "std": 0.04 },
    "z_close": { "mean": 0.0, "std": 1.0 }
  },
  "features_hash": "a1b2c3d4e5f6...",
  "git_commit_hash": "abc123def456...",
  "storage_path": "/models/v1.0.0/model.json"
}
```

**Cache-Control:** `public, s-maxage=3600, stale-while-revalidate=600`

**Error Responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 404 | Not Found | No stable model available |

---

### GET /api/predictions

Fetch prediction history for a ticker.

**URL:** `GET /api/predictions`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticker` | string | Yes | Stock symbol |
| `days` | number | No | Limit to last N days |

**Example Request:**
```bash
# Get all predictions for ASML
curl "http://localhost:3000/api/predictions?ticker=ASML.AS"

# Get recent predictions (last 30 days)
curl "http://localhost:3000/api/predictions?ticker=ASML.AS&days=30"
```

**Example Response:**
```json
{
  "ticker": "ASML.AS",
  "predictions": [
    {
      "id": 1001,
      "ticker": "ASML.AS",
      "model_version": "1.0.0",
      "predicted_at": "2026-03-15T09:30:00Z",
      "prediction_window_days": 3,
      "predicted_direction": true,
      "confidence": 0.72,
      "actual_direction": true,
      "was_correct": true,
      "created_at": "2026-03-15T09:30:00Z"
    }
  ],
  "count": 1
}
```

**Cache-Control:** `no-store` (always fresh)

---

### POST /api/predictions

Create a new prediction record.

**URL:** `POST /api/predictions`

**Request Body:**

```json
{
  "ticker": "ASML.AS",
  "model_version": "1.0.0",
  "predicted_direction": true,
  "confidence": 0.72
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ticker` | string | Yes | Stock symbol |
| `model_version` | string | Yes | Model version used |
| `predicted_direction` | boolean | Yes | true=Up, false=Down |
| `confidence` | number | No | 0-1 scale |

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/predictions" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "ASML.AS",
    "model_version": "1.0.0",
    "predicted_direction": true,
    "confidence": 0.72
  }'
```

**Example Response:**
```json
{
  "id": 1002,
  "ticker": "ASML.AS",
  "model_version": "1.0.0",
  "predicted_at": "2026-03-18T14:30:00Z",
  "prediction_window_days": 3,
  "predicted_direction": true,
  "confidence": 0.72,
  "actual_direction": null,
  "was_correct": null,
  "created_at": "2026-03-18T14:30:00Z"
}
```

**Status Code:** `201 Created`

**Error Responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Validation Error | Invalid request body |
| 400 | Validation Error | Invalid ticker or model_version |

---

## Error Codes

All errors follow this format:

```json
{
  "error": "ErrorType",
  "message": "Human-readable description",
  "details": {
    "field": ["validation message"]
  }
}
```

### HTTP Status Codes

| Status | Error Type | Description |
|--------|------------|-------------|
| 200 | - | Success |
| 201 | - | Created |
| 400 | Validation Error | Invalid request parameters |
| 401 | Unauthorized | Missing authentication |
| 403 | Forbidden | Access denied |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 502 | Bad Gateway | External API error |
| 503 | Service Unavailable | External API unavailable |

### Error Types

| Error | Description |
|-------|-------------|
| `Validation Error` | Invalid request parameters |
| `Bad Request` | Malformed JSON body |
| `Not Found` | Resource doesn't exist |
| `Not Implemented` | Feature not available |
| `External API Error` | Third-party API failure |
| `Internal Server Error` | Unexpected server error |

---

## Examples

### JavaScript/Fetch

```javascript
// Fetch companies
const response = await fetch('/api/companies?sector=Technology');
const { companies, total } = await response.json();

// Fetch prices
const priceResponse = await fetch('/api/prices?ticker=ASML.AS&limit=30');
const { prices } = await priceResponse.json();

// Fetch quote
const quoteResponse = await fetch('/api/finnhub/quote?symbol=ASML.AS');
const quote = await quoteResponse.json();

// Create prediction
const predResponse = await fetch('/api/predictions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ticker: 'ASML.AS',
    model_version: '1.0.0',
    predicted_direction: true,
    confidence: 0.72
  })
});
const prediction = await predResponse.json();
```

### TypeScript

```typescript
import type { Company, Price, FinnhubQuote, Prediction } from '@/types';

// Fetch companies
async function getCompanies(filters: CompanyFilters = {}): Promise<Company[]> {
  const params = new URLSearchParams(filters as Record<string, string>);
  const response = await fetch(`/api/companies?${params}`);
  const data = await response.json();
  return data.companies;
}

// Fetch prices
async function getPrices(
  ticker: string,
  options?: { start_date?: string; limit?: number }
): Promise<Price[]> {
  const params = new URLSearchParams({ ticker, ...options });
  const response = await fetch(`/api/prices?${params}`);
  const data = await response.json();
  return data.prices;
}

// Fetch quote
async function getQuote(symbol: string): Promise<FinnhubQuote> {
  const response = await fetch(`/api/finnhub/quote?symbol=${symbol}`);
  return response.json();
}

// Create prediction
async function createPrediction(input: CreatePredictionInput): Promise<Prediction> {
  const response = await fetch('/api/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return response.json();
}
```

### React Hook

```typescript
import { useState, useEffect } from 'react';
import { useModelLoader } from '@/hooks/useModelLoader';
import { modelService } from '@/lib/ml/ModelService';

function StockPrediction({ ticker, prices }: { ticker: string; prices: Price[] }) {
  const { isLoaded, isLoading, error, loadModel } = useModelLoader();
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  useEffect(() => {
    if (!isLoaded && !isLoading) {
      loadModel();
    }
  }, [isLoaded, isLoading, loadModel]);

  const handlePredict = async () => {
    try {
      const result = await modelService.predictFromPrices(prices);
      setPrediction(result);
    } catch (err) {
      console.error('Prediction failed:', err);
    }
  };

  return (
    <div>
      {isLoading && <div>Loading model...</div>}
      {error && <div>Error: {error}</div>}
      {isLoaded && (
        <button onClick={handlePredict}>Predict</button>
      )}
      {prediction && (
        <div>
          Direction: {prediction.direction}
          Confidence: {(prediction.confidence * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
```

---

## API Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-18 | Initial API documentation |

---

## Support

For API issues:
1. Check response `error` field for details
2. Verify environment variables are set
3. Check server logs for internal errors
4. Report issues with request/response examples

---

Last updated: 2026-03-18
