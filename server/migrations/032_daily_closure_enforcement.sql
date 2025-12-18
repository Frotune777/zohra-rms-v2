-- ===============================================
-- Migration: Daily Cash Closure Enforcement
-- Purpose: Add fields and functions for day locking
-- Author: Accounting System Refactor
-- Date: 2025-12-18
-- ===============================================

BEGIN;

-- 1. Add closure tracking fields to daily_balances
ALTER TABLE daily_balances
ADD COLUMN IF NOT EXISTS closed_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS variance_je_id UUID REFERENCES journal_entries(id),
ADD COLUMN IF NOT EXISTS reopen_count INT DEFAULT 0;

-- 2. Create function to check if day is closed
CREATE OR REPLACE FUNCTION is_day_closed(check_date DATE, check_type VARCHAR DEFAULT 'Counter') 
RETURNS BOOLEAN AS $$
DECLARE
    closure_status VARCHAR;
BEGIN
    SELECT status INTO closure_status 
    FROM daily_balances 
    WHERE date = check_date AND type = check_type;
    
    RETURN COALESCE(closure_status, 'Open') = 'Closed';
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to validate transaction date is not closed
CREATE OR REPLACE FUNCTION validate_transaction_date()
RETURNS TRIGGER AS $$
DECLARE
    payment_mode_lower VARCHAR;
    is_cash_transaction BOOLEAN;
    day_is_closed BOOLEAN;
BEGIN
    -- Determine if this is a cash transaction
    payment_mode_lower := LOWER(COALESCE(NEW.payment_method, NEW.payment_mode, ''));
    is_cash_transaction := payment_mode_lower IN ('cash', 'manager_float');
    
    -- Check if day is closed (only for cash transactions)
    IF is_cash_transaction THEN
        day_is_closed := is_day_closed(NEW.date);
        
        IF day_is_closed THEN
            RAISE EXCEPTION 'Cannot create/modify transaction: Day % is closed', NEW.date;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_balances_status_date 
ON daily_balances(status, date);

CREATE INDEX IF NOT EXISTS idx_daily_balances_closed_by 
ON daily_balances(closed_by) WHERE closed_by IS NOT NULL;

-- 5. Add comments for documentation
COMMENT ON COLUMN daily_balances.closed_by IS 'User ID who closed this day';
COMMENT ON COLUMN daily_balances.closed_at IS 'Timestamp when day was closed';
COMMENT ON COLUMN daily_balances.variance_je_id IS 'Journal entry ID for cash variance posting';
COMMENT ON COLUMN daily_balances.reopen_count IS 'Number of times this day has been reopened (audit trail)';

COMMENT ON FUNCTION is_day_closed(DATE, VARCHAR) IS 'Check if a specific date is closed for cash transactions';
COMMENT ON FUNCTION validate_transaction_date() IS 'Trigger function to prevent transactions on closed days';

-- 6. Verification
DO $$
BEGIN
    -- Test the function
    IF is_day_closed('2099-12-31') THEN
        RAISE NOTICE 'Day closure check function working correctly';
    ELSE
        RAISE NOTICE 'Day closure check function installed (no closed days yet)';
    END IF;
END $$;

COMMIT;

-- Note: Triggers on transactions table will be added after we refactor the transaction flow
-- This migration only creates the infrastructure

-- Rollback instructions:
-- ALTER TABLE daily_balances DROP COLUMN IF EXISTS closed_by;
-- ALTER TABLE daily_balances DROP COLUMN IF EXISTS closed_at;
-- ALTER TABLE daily_balances DROP COLUMN IF EXISTS variance_je_id;
-- ALTER TABLE daily_balances DROP COLUMN IF EXISTS reopen_count;
-- DROP FUNCTION IF EXISTS is_day_closed(DATE, VARCHAR);
-- DROP FUNCTION IF EXISTS validate_transaction_date();
