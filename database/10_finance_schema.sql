-- Finance Module Schema

-- Journal Entries Table (Header)
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    reference_id INTEGER, -- e.g., payroll_id, sale_id
    reference_type VARCHAR(50), -- 'Payroll', 'Sale', 'Expense'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ledger Lines Table (Details)
CREATE TABLE IF NOT EXISTS ledger_lines (
    id SERIAL PRIMARY KEY,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL, -- 'Cash', 'Bank', 'Salaries Expense', 'Sales Revenue'
    debit DECIMAL(12, 2) DEFAULT 0,
    credit DECIMAL(12, 2) DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_lines(account_name);
