-- Phase 2: Vendor Payment & Ledger System - Database Schema
-- Run this migration to create vendor payment infrastructure

-- 1. Create vendor_categories table
CREATE TABLE IF NOT EXISTS vendor_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    expense_account_code INTEGER REFERENCES chart_of_accounts(code),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed vendor categories
INSERT INTO vendor_categories (name, expense_account_code, description) VALUES
('COGS - Nonveg', 5000, 'Cost of Goods Sold - Meat/Chicken/Fish'),
('COGS - Dairy', 5000, 'Cost of Goods Sold - Milk/Paneer/Curd'),
('COGS - Grocery', 5000, 'Cost of Goods Sold - Spices/Rice/Flour'),
('Opex - Fuel', 6000, 'Operating Expense - Petrol/Diesel'),
('Opex - Packaging', 6000, 'Operating Expense - Containers/Bags'),
('Opex - Gas Cylinder', 6000, 'Operating Expense - LPG/Gas')
ON CONFLICT (name) DO NOTHING;

-- 2. Update suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES vendor_categories(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Create vendor_payments table
CREATE TABLE IF NOT EXISTS vendor_payments (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_mode VARCHAR(50) NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit Adjustment')),
    reference_number VARCHAR(100),
    notes TEXT NOT NULL,
    paid_by VARCHAR(100) NOT NULL,
    attachment_url TEXT,
    journal_entry_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_mode ON vendor_payments(payment_mode);

-- 4. Update vendor_ledger table
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50);
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES vendor_categories(id);
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES vendor_payments(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_supplier ON vendor_ledger(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_date ON vendor_ledger(date);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_type ON vendor_ledger(transaction_type);

-- 5. Add constraint to ensure vendor_ledger amount is positive
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_ledger_amount_positive'
    ) THEN
        ALTER TABLE vendor_ledger 
        ADD CONSTRAINT vendor_ledger_amount_positive CHECK (amount != 0);
    END IF;
END $$;

-- 6. Create view for vendor outstanding balances
CREATE OR REPLACE VIEW vendor_outstanding AS
SELECT 
    s.id as vendor_id,
    s.name as vendor_name,
    s.vendor_type,
    s.category_id,
    vc.name as category_name,
    COALESCE(s.opening_balance, 0) + 
    COALESCE(SUM(CASE 
        WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.amount
        WHEN vl.transaction_type = 'Payment' THEN -vl.amount
        ELSE 0 
    END), 0) as outstanding_balance,
    COUNT(CASE WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN 1 END) as total_bills,
    COUNT(CASE WHEN vl.transaction_type = 'Payment' THEN 1 END) as total_payments,
    MAX(vl.date) as last_transaction_date
FROM suppliers s
LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id
LEFT JOIN vendor_categories vc ON s.category_id = vc.id
GROUP BY s.id, s.name, s.vendor_type, s.category_id, vc.name, s.opening_balance;

COMMIT;
