-- ===============================================
-- Migration: Financial Period Locking
-- Purpose: Enforce period locking for journal entries
-- Author: Accounting System Refactor
-- Date: 2025-12-18
-- ===============================================

BEGIN;

-- 1. Ensure financial_periods table has proper constraints
ALTER TABLE financial_periods
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;

-- Make sure status constraint exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_period_status'
    ) THEN
        ALTER TABLE financial_periods
        ADD CONSTRAINT chk_financial_period_status
        CHECK (status IN ('Open', 'Locked', 'Closed'));
    END IF;
END $$;

-- 2. Create function to get period status for a date
CREATE OR REPLACE FUNCTION get_period_status(check_date DATE)
RETURNS VARCHAR AS $$
DECLARE
    period_status VARCHAR;
BEGIN
    SELECT status INTO period_status
    FROM financial_periods
    WHERE check_date BETWEEN start_date AND end_date
    LIMIT 1;
    
    RETURN COALESCE(period_status, 'Open');
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to validate journal entry date
CREATE OR REPLACE FUNCTION validate_journal_period()
RETURNS TRIGGER AS $$
DECLARE
    period_status VARCHAR;
BEGIN
    period_status := get_period_status(NEW.transaction_date);
    
    IF period_status IN ('Locked', 'Closed') THEN
        RAISE EXCEPTION 'Cannot create/modify journal entry: Period for % is %', 
            NEW.transaction_date, period_status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Apply trigger to journal_entries
DROP TRIGGER IF EXISTS trigger_journal_period_check ON journal_entries;
CREATE TRIGGER trigger_journal_period_check
    BEFORE INSERT OR UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION validate_journal_period();

-- 5. Create helper function to auto-create periods
CREATE OR REPLACE FUNCTION ensure_period_exists(for_date DATE)
RETURNS VOID AS $$
DECLARE
    month_start DATE;
    month_end DATE;
    period_name VARCHAR;
BEGIN
    month_start := DATE_TRUNC('month', for_date)::DATE;
    month_end := (DATE_TRUNC('month', for_date) + INTERVAL '1 month - 1 day')::DATE;
    period_name := TO_CHAR(for_date, 'Mon YYYY');
    
    INSERT INTO financial_periods (name, start_date, end_date, status)
    VALUES (period_name, month_start, month_end, 'Open')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 6. Create periods for last 12 months and next 3 months
DO $$
DECLARE
    i INTEGER;
    period_date DATE;
BEGIN
    FOR i IN -12..3 LOOP
        period_date := (CURRENT_DATE + (i || ' months')::INTERVAL)::DATE;
        PERFORM ensure_period_exists(period_date);
    END LOOP;
    
    RAISE NOTICE 'Created financial periods for last 12 months and next 3 months';
END $$;

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_financial_periods_dates 
ON financial_periods(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_financial_periods_status 
ON financial_periods(status);

-- 8. Add comments
COMMENT ON FUNCTION get_period_status(DATE) IS 'Get the status of the financial period containing the given date';
COMMENT ON FUNCTION validate_journal_period() IS 'Trigger to prevent journal entries in locked/closed periods';
COMMENT ON FUNCTION ensure_period_exists(DATE) IS 'Auto-create a financial period for a given date if it doesn''t exist';

-- 9. Verification
DO $$
DECLARE
    period_count INTEGER;
    open_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO period_count FROM financial_periods;
    SELECT COUNT(*) INTO open_count FROM financial_periods WHERE status = 'Open';
    
    RAISE NOTICE 'Financial periods: % total, % open', period_count, open_count;
END $$;

COMMIT;

-- Rollback instructions:
-- DROP TRIGGER IF EXISTS trigger_journal_period_check ON journal_entries;
-- DROP FUNCTION IF EXISTS validate_journal_period();
-- DROP FUNCTION IF EXISTS get_period_status(DATE);
-- DROP FUNCTION IF EXISTS ensure_period_exists(DATE);
-- ALTER TABLE financial_periods DROP COLUMN IF EXISTS locked_at;
-- ALTER TABLE financial_periods DROP COLUMN IF EXISTS closed_at;
