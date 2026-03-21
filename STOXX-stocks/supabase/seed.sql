-- ============================================
-- STOXX-stocks Seed Data
-- 45 STOXX 600 Companies
-- Source: Product Requirements Document
-- ============================================

-- Insert all 45 companies
INSERT INTO companies (ticker, name, exchange, sector, country, is_distressed) VALUES
-- Healthy Companies (38)
('ASML.AS', 'ASML Holding', 'XAMS', 'Technology', 'NL', FALSE),
('SAP.DE', 'SAP', 'XETR', 'Technology', 'DE', FALSE),
('NOVO-B.CO', 'Novo Nordisk', 'XCSE', 'Healthcare', 'DK', FALSE),
('MC.PA', 'LVMH', 'XPAR', 'Consumer Discretionary', 'FR', FALSE),
('NESN.SW', 'Nestle', 'XSWX', 'Consumer Staples', 'CH', FALSE),
('ROG.SW', 'Roche', 'XSWX', 'Healthcare', 'CH', FALSE),
('SIE.DE', 'Siemens', 'XETR', 'Industrials', 'DE', FALSE),
('TTE.PA', 'TotalEnergies', 'XPAR', 'Energy', 'FR', FALSE),
('AZN.L', 'AstraZeneca', 'XLON', 'Healthcare', 'GB', FALSE),
('HSBA.L', 'HSBC', 'XLON', 'Financials', 'GB', FALSE),
('SU.PA', 'Schneider Electric', 'XPAR', 'Industrials', 'FR', FALSE),
('ALV.DE', 'Allianz', 'XETR', 'Financials', 'DE', FALSE),
('SAF.PA', 'Safran', 'XPAR', 'Industrials', 'FR', FALSE),
('BNP.PA', 'BNP Paribas', 'XPAR', 'Financials', 'FR', FALSE),
('SAN.MC', 'Santander', 'XMAD', 'Financials', 'ES', FALSE),
('ULVR.L', 'Unilever', 'XLON', 'Consumer Staples', 'GB', FALSE),
('ADYEN.AS', 'Adyen', 'XAMS', 'Technology', 'NL', FALSE),
('ABBN.SW', 'ABB', 'XSWX', 'Industrials', 'CH', FALSE),
('DSY.PA', 'Dassault Systemes', 'XPAR', 'Technology', 'FR', FALSE),
('AIR.PA', 'Airbus', 'XPAR', 'Industrials', 'FR', FALSE),
('RR.L', 'Rolls-Royce', 'XLON', 'Industrials', 'GB', FALSE),
('ISP.MI', 'Intesa Sanpaolo', 'XMIL', 'Financials', 'IT', FALSE),
('INGA.AS', 'ING', 'XAMS', 'Financials', 'NL', FALSE),
('CS.PA', 'AXA', 'XPAR', 'Financials', 'FR', FALSE),
('OR.PA', 'L''Oreal', 'XPAR', 'Consumer Staples', 'FR', FALSE),
('ABI.BR', 'Anheuser-Busch InBev', 'XBRU', 'Consumer Staples', 'BE', FALSE),
('GSK.L', 'GSK', 'XLON', 'Healthcare', 'GB', FALSE),
('BHP.L', 'BHP', 'XLON', 'Materials', 'GB', FALSE),
('SHEL.L', 'Shell', 'XLON', 'Energy', 'GB', FALSE),
('IBE.MC', 'Iberdrola', 'XMAD', 'Utilities', 'ES', FALSE),
('ENEL.MI', 'Enel', 'XMIL', 'Utilities', 'IT', FALSE),
('DTE.DE', 'Deutsche Telekom', 'XETR', 'Telecommunications', 'DE', FALSE),
-- Distressed Companies (7)
('VOW3.DE', 'Volkswagen', 'XETR', 'Consumer Discretionary', 'DE', TRUE),
('TKA.DE', 'Thyssenkrupp', 'XETR', 'Industrials', 'DE', TRUE),
('UBI.PA', 'Ubisoft', 'XPAR', 'Technology', 'FR', TRUE),
('SINCH.ST', 'Sinch', 'XSTO', 'Technology', 'SE', TRUE),
('SDF.DE', 'K+S', 'XETR', 'Materials', 'DE', TRUE),
('DBK.DE', 'Deutsche Bank', 'XETR', 'Financials', 'DE', TRUE),
('VNA.DE', 'Vonovia', 'XETR', 'Real Estate', 'DE', TRUE),
-- Additional Healthy Companies (2)
('CRH.L', 'CRH', 'XLON', 'Materials', 'GB', FALSE),
('FLTR.L', 'Flutter Entertainment', 'XLON', 'Consumer Discretionary', 'GB', FALSE),
('NOKIA.HE', 'Nokia', 'XHEL', 'Technology', 'FI', FALSE),
('VOLV-B.ST', 'Volvo', 'XSTO', 'Industrials', 'SE', FALSE),
('CARL-B.CO', 'Carlsberg', 'XCSE', 'Consumer Staples', 'DK', FALSE),
('KBC.BR', 'KBC Group', 'XBRU', 'Financials', 'BE', FALSE)
ON CONFLICT (ticker) DO UPDATE SET
    name = EXCLUDED.name,
    exchange = EXCLUDED.exchange,
    sector = EXCLUDED.sector,
    country = EXCLUDED.country,
    is_distressed = EXCLUDED.is_distressed;

-- Verify the count
SELECT 
    COUNT(*) as total_companies,
    COUNT(*) FILTER (WHERE is_distressed = FALSE) as healthy,
    COUNT(*) FILTER (WHERE is_distressed = TRUE) as distressed
FROM companies;
