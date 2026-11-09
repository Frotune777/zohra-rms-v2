-- Runtime schema prerequisites for existing auth, finance and HR APIs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ledger_account_code INTEGER
    REFERENCES chart_of_accounts(code);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ledger_account_code INTEGER
    REFERENCES chart_of_accounts(code);
INSERT INTO chart_of_accounts (code, name, type)
VALUES (1030, 'Cash - Manager Float', 'Asset'),
       (5300, 'Grocery Costs', 'Expense'),
       (6100, 'Labor Costs', 'Expense'),
       (6200, 'Rent', 'Expense'),
       (6300, 'Utilities', 'Expense'),
       (6700, 'Maintenance', 'Expense'),
       (6800, 'Marketing', 'Expense'),
       (6900, 'Miscellaneous Expenses', 'Expense')
ON CONFLICT (code) DO NOTHING;
-- The UUID journal schema in 00_init.sql is authoritative. The alternate
-- SERIAL schema in 10_finance_schema.sql never added these to existing tables.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reference_id TEXT,
    ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
-- Runtime HR controllers declare these fields even though the old SQL sets
-- never created them. Retain the legacy payout flag until its caller migrates.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS govt_id_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS govt_id_number VARCHAR(100);
ALTER TABLE salary_history ALTER COLUMN days_worked TYPE NUMERIC(6,2);
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS is_recovered BOOLEAN DEFAULT FALSE;
UPDATE salary_advances SET is_recovered = COALESCE(recovered_amount,0) >= amount;
ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) DEFAULT 'Normal',
    ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS repayment_months INTEGER DEFAULT 3,
    ADD COLUMN IF NOT EXISTS monthly_deduction NUMERIC(10,2);
ALTER TABLE advance_ledger ADD COLUMN IF NOT EXISTS advance_request_id INTEGER REFERENCES advance_requests(id),
    ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS repayment_source VARCHAR(100);
CREATE TABLE IF NOT EXISTS advance_repayment_schedule (
    id SERIAL PRIMARY KEY,
    advance_request_id INTEGER REFERENCES advance_requests(id),
    employee_id INTEGER REFERENCES employees(id),
    month_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    scheduled_amount NUMERIC(10,2) NOT NULL,
    UNIQUE(advance_request_id,month_number)
);
CREATE TABLE IF NOT EXISTS advance_audit_log (
    id SERIAL PRIMARY KEY,
    advance_request_id INTEGER REFERENCES advance_requests(id),
    employee_id INTEGER REFERENCES employees(id),
    action VARCHAR(50) NOT NULL,
    new_value JSONB,
    changed_by INTEGER REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changed_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS metadata JSONB;
