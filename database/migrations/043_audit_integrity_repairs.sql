BEGIN;
ALTER TABLE vendor_payments DROP CONSTRAINT IF EXISTS vendor_payments_payment_mode_check;
ALTER TABLE vendor_payments ADD CONSTRAINT vendor_payments_payment_mode_check
    CHECK (payment_mode IN ('Cash', 'UPI', 'Bank', 'Bank Transfer', 'Card', 'Cheque', 'Credit Adjustment'));
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Posted';
ALTER TABLE salary_history ADD COLUMN IF NOT EXISTS total_days_in_month INTEGER;
ALTER TABLE salary_history ALTER COLUMN paid_by TYPE TEXT USING paid_by::text;
ALTER TABLE salary_history ADD COLUMN IF NOT EXISTS paid_by_user_id INTEGER REFERENCES users(id);
CREATE TABLE IF NOT EXISTS payroll_recovery_allocations (
    id BIGSERIAL PRIMARY KEY, salary_history_id INTEGER NOT NULL,
    advance_id INTEGER NOT NULL REFERENCES salary_advances(id),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
    amount NUMERIC(10,2) NOT NULL CHECK(amount > 0), reversed BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO chart_of_accounts(code,name,type) VALUES
    (7000,'Cash shortage','Expense'),(7100,'Cash excess','Revenue') ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS imported_source_rows (
    source_key TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS operation_keys (
    scope TEXT NOT NULL, key TEXT NOT NULL, request JSONB NOT NULL, response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(scope,key)
);
COMMIT;
