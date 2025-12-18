-- ===============================================
-- Migration: Payment Modes Configuration
-- Purpose: Replace hardcoded account mappings with dynamic configuration
-- Author: Accounting System Refactor
-- Date: 2025-12-18
-- ===============================================

BEGIN;

-- 1. Create payment_modes table
CREATE TABLE IF NOT EXISTS payment_modes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    account_code INT NOT NULL REFERENCES chart_of_accounts(code),
    is_active BOOLEAN DEFAULT TRUE,
    requires_reference BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Seed with current hardcoded mappings
INSERT INTO payment_modes (name, display_name, account_code, requires_reference, description) VALUES
('cash', 'Cash', 1000, FALSE, 'Cash on Hand - Counter'),
('bank', 'Bank Transfer', 1010, TRUE, 'Bank - Main Account'),
('upi', 'UPI Payment', 1020, TRUE, 'UPI Clearing Account'),
('manager_float', 'Manager Float', 1030, FALSE, 'Cash - Manager Float'),
('cheque', 'Cheque', 1010, TRUE, 'Bank - Cheque Payment'),
('card', 'Card/POS', 1010, TRUE, 'Bank - Card Settlement')
ON CONFLICT (name) DO NOTHING;

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_modes_active ON payment_modes(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_modes_name ON payment_modes(name);

-- 4. Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_payment_modes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_modes_updated_at ON payment_modes;
CREATE TRIGGER trigger_payment_modes_updated_at
    BEFORE UPDATE ON payment_modes
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_modes_updated_at();

-- 5. Verification query
DO $$
DECLARE
    mode_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO mode_count FROM payment_modes WHERE is_active = TRUE;
    RAISE NOTICE 'Created payment_modes table with % active modes', mode_count;
END $$;

COMMIT;

-- Rollback instructions:
-- DROP TABLE IF EXISTS payment_modes CASCADE;
