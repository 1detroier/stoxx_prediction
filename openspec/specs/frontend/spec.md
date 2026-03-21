# Frontend Specification

## Purpose

Define Next.js frontend components and pages for STOXX-stocks: company dashboard, price charts, live quotes, prediction display, and risk metrics.

## Requirements

### Requirement: Company Dashboard (F1)

The system MUST display 45 STOXX 600 companies with filtering capabilities.

**Layout:**
- Header with app title "STOXX-Stocks"
- Filter bar: sector dropdown, country dropdown, status toggle (Healthy/Distressed), search input
- Company list as scrollable card grid
- Each card shows: ticker, name, exchange badge, sector, country flag

**Filtering:**
- Sector filter: All, Technology, Healthcare, Financials, Consumer, Energy, Industrial, Utilities
- Country filter: All, DE, NL, FR, GB, ES, IT, CH
- Status: All, Healthy, Distressed
- Search: Real-time filtering on ticker/name

#### Scenario: Load Dashboard

- GIVEN user navigates to dashboard URL
- WHEN page loads
- THEN all 45 companies SHALL be fetched from /api/companies
- AND displayed in a responsive grid
- AND distressed companies SHALL have red left border

#### Scenario: Filter by Sector

- GIVEN dashboard is loaded with all companies
- WHEN user selects "Technology" from sector dropdown
- THEN only Technology sector companies SHALL display
- AND filter count SHALL update

### Requirement: Price Charts (F2)

The system MUST display TradingView Lightweight Charts with resolution switching.

**Chart Configuration:**
- Library: TradingView Lightweight Charts v4+
- Theme: Dark mode (--chart-background: #131722)
- Crosshair: Normal mode
- Time scale: Time zones disabled

**Resolution Options:**
| Label | Data Type | Bars Shown |
|-------|-----------|------------|
| 5-day | 60-minute | ~75 bars |
| 1m | Daily | ~22 bars |
| 6m | Daily | ~130 bars |
| 1y | Daily | ~252 bars |
| 5y | Daily | ~1260 bars |

**Chart Behavior:**
- Resolution selector: Button group above chart
- On resolution change: MUST fetch new data, clear chart, redraw
- Responsive: Chart container fills available width, height=400px minimum
- Price line: Current price highlighted

#### Scenario: View Daily Chart

- GIVEN company "ASML" is selected
- WHEN chart component mounts
- THEN daily bars for last year SHALL load by default
- AND chart SHALL render with OHLC data

#### Scenario: Switch to 5-Day View

- GIVEN viewing daily chart for "ASML"
- WHEN user clicks "5-day" button
- THEN resolution SHALL switch to 60-minute bars
- AND chart SHALL clear and redraw with intraday data
- AND price axis SHALL update to HH:MM format

### Requirement: Live Quotes (F3)

The system MUST display real-time Finnhub quotes with fallback handling.

**Quote Display:**
- Location: Above or beside chart
- Fields: Current price (large), Change (colored green/red), Change % (colored)
- Last update timestamp: "Updated 2 min ago"

**Fallback Behavior:**
- If Finnhub unavailable: Display banner "Price temporarily unavailable"
- Show last known Supabase price with timestamp
- Visual indicator that data may be stale

#### Scenario: Show Live Quote

- GIVEN company "ASML" is selected
- WHEN Finnhub returns price $723.50, change +$2.70 (+0.37%)
- THEN display SHALL show "$723.50" prominently
- AND change "+$2.70 (+0.37%)" in green text

#### Scenario: Finnhub Unavailable

- GIVEN Finnhub API returns error
- WHEN quote component receives error
- THEN display "Price temporarily unavailable" banner
- AND show last Supabase close price with "as of [date]" label
- AND do NOT silently show stale data

### Requirement: Prediction Display (F4)

The system MUST run TensorFlow.js inference and show 3-day directional prediction.

**Prediction Panel:**
- Location: Below chart or in side panel
- Direction indicator: Up arrow (green) / Down arrow (red) / Neutral (gray)
- Confidence bar: 0-100% with visual progress bar
- Model version badge: "Model v1.0.0"

**Accuracy Metrics (from model metadata):**
- Balanced accuracy: XX%
- Healthy accuracy: XX%
- Distressed accuracy: XX%
- Alert badge if distressed accuracy < 55%

**Inference Flow:**
1. Load model from Supabase Storage URL
2. Fetch latest prices (last 20 days)
3. Apply Z-score normalization using stored params
4. Run prediction
5. Display result with confidence

#### Scenario: Show Prediction

- GIVEN TensorFlow.js model is loaded
- WHEN user views company "ASML"
- THEN prediction SHALL display direction "UP" with confidence "72%"
- AND stratified accuracy metrics SHALL show below

#### Scenario: Distressed Accuracy Alert

- GIVEN model distressed_accuracy = 0.52 (< 55%)
- THEN warning banner SHALL display: "⚠️ Model may not recognize failure patterns"
- AND banner SHOULD suggest retraining with more distress data

### Requirement: Prediction vs Reality Chart (F5)

The system MUST display 30-day prediction accuracy visualization.

**Chart Features:**
- X-axis: Date (last 30 days)
- Y-axis: Accuracy (0-100%)
- Line chart showing rolling accuracy
- Color coding: Green dot for correct, Red dot for incorrect

**Data Source:** Fetch from /api/predictions with actual_direction filled

#### Scenario: View Accuracy Trend

- GIVEN user clicks "Predictions" tab
- WHEN 30 days of predictions exist
- THEN chart SHALL show accuracy trend
- AND legend SHALL show "Correct: X, Incorrect: Y"

### Requirement: Risk Metrics (F6)

The system MUST display Sharpe Ratio and additional risk indicators.

**Metrics Display:**
- Sharpe Ratio: Calculated from daily returns, risk-free rate = 0
- Display format: "Sharpe: 1.45"
- Time period: 1-year lookback

#### Scenario: Display Sharpe Ratio

- GIVEN company "ASML" is selected
- WHEN price data loads
- THEN Sharpe Ratio SHALL be calculated from daily returns
- AND displayed in metrics panel

## Non-Functional Requirements

- Dashboard initial load: < 3s on 3G
- Chart rendering: < 500ms for 1260 bars
- Prediction inference: < 2s including model load
- Accessibility: All interactive elements keyboard accessible
- Mobile: Responsive layout, charts resize properly
