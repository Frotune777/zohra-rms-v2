-- 10 Financial Periods

BEGIN;

-- 1. Create Financial Periods Table
CREATE TABLE IF NOT EXISTS financial_periods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- e.g. "January 2025"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Open', -- Open, Closed
    closed_at TIMESTAMP,
    closed_by_user_id INTEGER,
    CONSTRAINT unique_period_dates UNIQUE (start_date, end_date)
);

CREATE INDEX idx_financial_periods_dates ON financial_periods(start_date, end_date);

-- 2. Function to Check Period Status
CREATE OR REPLACE FUNCTION check_period_open()
RETURNS TRIGGER AS $$
DECLARE
    period_status VARCHAR(20);
BEGIN
    -- Check if transaction date falls in a closed period
    SELECT status INTO period_status
    FROM financial_periods
    WHERE NEW.transaction_date >= start_date AND NEW.transaction_date <= end_date
    LIMIT 1;

    -- If period exists and is closed, raise error
    IF (period_status = 'Closed') THEN
        RAISE EXCEPTION 'Financial Period for date % is Closed. Cannot post transaction.', NEW.transaction_date;
    END IF;

    -- If no period defined, we assume it's Open (or strict mode: require period).
    -- For this system, we default to Open to avoid blocking new usage.
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Apply Trigger to Journal Entries
DROP TRIGGER IF EXISTS check_period_journal ON journal_entries;
CREATE TRIGGER check_period_journal
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION check_period_open();

COMMIT;
