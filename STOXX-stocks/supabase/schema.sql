-- ============================================
-- STOXX-stocks Database Schema
-- ============================================
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: companies
-- Stores metadata for all tracked companies
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
    ticker VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    sector VARCHAR(50) NOT NULL,
    country VARCHAR(2) NOT NULL,
    is_distressed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(country);
CREATE INDEX IF NOT EXISTS idx_companies_distressed ON companies(is_distressed);

-- ============================================
-- Table: prices
-- Stores historical OHLCV price data
-- ============================================
CREATE TABLE IF NOT EXISTS prices (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
    date DATE NOT NULL,
    open DECIMAL(12, 4),
    high DECIMAL(12, 4),
    low DECIMAL(12, 4),
    close DECIMAL(12, 4),
    adjusted_close DECIMAL(12, 4),
    volume BIGINT,
    UNIQUE (ticker, date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date DESC);

-- ============================================
-- Table: models
-- Stores ML model metadata and Z-score parameters
-- ============================================
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(20) UNIQUE NOT NULL,
    is_stable BOOLEAN DEFAULT FALSE,
    training_date TIMESTAMP WITH TIME ZONE,
    git_commit_hash VARCHAR(40),
    training_accuracy DECIMAL(5, 4),
    distressed_accuracy DECIMAL(5, 4),
    zscore_params JSONB,
    features_hash VARCHAR(64),
    storage_path VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding stable model
CREATE INDEX IF NOT EXISTS idx_models_stable ON models(is_stable) WHERE is_stable = TRUE;

-- ============================================
-- Table: predictions
-- Stores prediction logs for tracking accuracy
-- ============================================
CREATE TABLE IF NOT EXISTS predictions (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
    model_version VARCHAR(20) NOT NULL REFERENCES models(version),
    predicted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    prediction_window_days INT DEFAULT 3,
    predicted_direction BOOLEAN NOT NULL,
    confidence DECIMAL(5, 4),
    actual_direction BOOLEAN,
    was_correct BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for prediction queries
CREATE INDEX IF NOT EXISTS idx_predictions_ticker ON predictions(ticker);
CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at ON predictions(predicted_at DESC);

-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Companies: Public read access
CREATE POLICY "Public can read companies"
    ON companies FOR SELECT
    USING (true);

-- Companies: Service role can do anything
CREATE POLICY "Service role can manage companies"
    ON companies FOR ALL
    USING (auth.role() = 'service_role');

-- Prices: Public read access
CREATE POLICY "Public can read prices"
    ON prices FOR SELECT
    USING (true);

-- Prices: Service role can do anything
CREATE POLICY "Service role can manage prices"
    ON prices FOR ALL
    USING (auth.role() = 'service_role');

-- Models: Public read access
CREATE POLICY "Public can read models"
    ON models FOR SELECT
    USING (true);

-- Models: Service role can do anything
CREATE POLICY "Service role can manage models"
    ON models FOR ALL
    USING (auth.role() = 'service_role');

-- Predictions: Public read access
CREATE POLICY "Public can read predictions"
    ON predictions FOR SELECT
    USING (true);

-- Predictions: Authenticated users can insert their predictions
CREATE POLICY "Authenticated users can insert predictions"
    ON predictions FOR INSERT
    WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- Predictions: Service role can do anything
CREATE POLICY "Service role can manage predictions"
    ON predictions FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- Storage Bucket for ML Models
-- ============================================
-- Run this in Supabase Dashboard > Storage > New bucket
-- Or use the SQL below:

INSERT INTO storage.buckets (id, name, public)
VALUES ('models', 'models', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for public read access to models
CREATE POLICY "Public can read models from storage"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'models');

-- Policy for authenticated uploads
CREATE POLICY "Authenticated can upload models"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'models' AND auth.role() IN ('authenticated', 'service_role'));

-- ============================================
-- Useful Views
-- ============================================

-- View for latest prediction per ticker
CREATE OR REPLACE VIEW latest_predictions AS
SELECT DISTINCT ON (p.ticker)
    p.*,
    c.name as company_name,
    c.sector,
    c.is_distressed
FROM predictions p
JOIN companies c ON p.ticker = c.ticker
ORDER BY p.ticker, p.predicted_at DESC;

-- View for model performance metrics
CREATE OR REPLACE VIEW model_performance AS
SELECT 
    m.version,
    m.is_stable,
    m.training_date,
    m.training_accuracy,
    m.distressed_accuracy,
    COUNT(DISTINCT CASE WHEN p.was_correct = TRUE THEN p.id END)::DECIMAL / 
        NULLIF(COUNT(p.id), 0) as actual_accuracy,
    COUNT(p.id) as total_predictions
FROM models m
LEFT JOIN predictions p ON m.version = p.model_version
GROUP BY m.id, m.version, m.is_stable, m.training_date, m.training_accuracy, m.distressed_accuracy;
