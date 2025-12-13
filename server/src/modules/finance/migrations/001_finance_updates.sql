-- 1. Create Categories Table
CREATE TABLE IF NOT EXISTS transaction_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('Income', 'Expense')),
    parent_id INTEGER REFERENCES transaction_categories(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed Initial Categories
INSERT INTO transaction_categories (name, type) VALUES 
('Sales', 'Income'),
('Consulting', 'Income'),
('Grocery', 'Expense'),
('Labor', 'Expense'),
('Utilities', 'Expense'),
('Rent', 'Expense'),
('Maintenance', 'Expense'),
('Marketing', 'Expense'),
('Bank Transfer', 'Expense'),
('Misc', 'Expense')
ON CONFLICT DO NOTHING;

-- 2. Update Transactions Table
-- Add 'mode' if it doesn't exist. 'payment_method' might already cover this, but 'mode' 
-- in the requirements specifically mentions 'Cash', 'Bank', 'Bank_Cash' as key data points.
-- Existing 'payment_method' has values like 'Cash', 'Card', 'UPI'.
-- 'Bank_Cash' is a special internal mode.
-- We can add a specialized 'transfer_mode' or just use 'payment_method' if we standardize it.
-- Let's add 'subcategory_id' linked to categories as well.

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES transaction_categories(id),
ADD COLUMN IF NOT EXISTS mode VARCHAR(50); 
-- We will migrate existing payment_methods to mode where appropriate or keep them aimed at 'mode' conceptually.
-- Actually, Requirement says Mode = Cash, Bank, Bank_Cash.
-- Payment Method = Cash, UPI, Card etc.
-- So Mode is high level, Payment Method is specific.

-- 3. Create Daily Balances Table (For Reconciliation)
CREATE TABLE IF NOT EXISTS daily_balances (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('Counter', 'Float')),
    opening_balance DECIMAL(12,2) DEFAULT 0.00,
    closing_balance DECIMAL(12,2) DEFAULT 0.00,
    actual_closing_balance DECIMAL(12,2), -- User input
    status VARCHAR(20) DEFAULT 'Open', -- Open, Closed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(date, type)
);

-- 4. Manager Float Table (Use daily_balances with type='Float', but maybe we need a ledger for it?)
-- The excel "Manager Float Calculation" is Opening + Transfer In - Float Expense = Closing.
-- This can be derived from transactions if we tag them correctly.
-- We'll use 'Bank_Cash' mode in transactions to track this.
