-- Fix missing tables for vendor payments and advance requests
-- This migration creates all missing tables causing 500 errors

BEGIN;

-- 1. Create payment_modes table (if not exists from accounting migration)
CREATE TABLE IF NOT EXISTS payment_modes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    account_code VARCHAR(10),  -- Removed FK constraint due to type mismatch
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default payment modes
INSERT INTO payment_modes (name, account_code, is_active, description)
VALUES 
    ('Cash', '1010', true, 'Cash payments'),
    ('UPI', '1020', true, 'UPI/Digital payments'),
    ('Card', '1030', true, 'Card payments'),
    ('Bank Transfer', '1040', true, 'Bank transfer payments'),
    ('Cheque', '1050', true, 'Cheque payments'),
    ('Credit', NULL, true, 'Credit/Due payments')
ON CONFLICT (name) DO NOTHING;

-- 2. Create vendor_categories table
CREATE TABLE IF NOT EXISTS vendor_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default vendor categories
INSERT INTO vendor_categories (name, description)
VALUES 
    ('Grocery', 'Grocery and food suppliers'),
    ('Chicken', 'Chicken and poultry suppliers'),
    ('Vegetables', 'Vegetable suppliers'),
    ('Dairy', 'Milk and dairy products'),
    ('Utilities', 'Electricity, water, gas'),
    ('Services', 'Cleaning, maintenance, etc'),
    ('Other', 'Other vendors')
ON CONFLICT (name) DO NOTHING;

-- 3. Create vendor_payments table
CREATE TABLE IF NOT EXISTS vendor_payments (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_by VARCHAR(100),
    notes TEXT,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);

-- 4. Create vendor_outstanding view
CREATE OR REPLACE VIEW vendor_outstanding AS
SELECT 
    s.id as vendor_id,
    s.name as vendor_name,
    s.vendor_type,
    COALESCE(SUM(CASE WHEN vl.transaction_type = 'Bill' THEN vl.amount ELSE 0 END), 0) as total_bills,
    COALESCE(SUM(CASE WHEN vl.transaction_type = 'Payment' THEN vl.amount ELSE 0 END), 0) as total_payments,
    COALESCE(SUM(CASE WHEN vl.transaction_type = 'Bill' THEN vl.amount ELSE -vl.amount END), 0) as outstanding_balance
FROM suppliers s
LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id
GROUP BY s.id, s.name, s.vendor_type;

-- 5. Create advance_requests table
CREATE TABLE IF NOT EXISTS advance_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    reason TEXT,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'Pending',
    requested_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    salary_advance_id INTEGER REFERENCES salary_advances(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_advance_status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);

CREATE INDEX IF NOT EXISTS idx_advance_requests_employee ON advance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_requests_status ON advance_requests(status);
CREATE INDEX IF NOT EXISTS idx_advance_requests_date ON advance_requests(request_date DESC);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_advance_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_advance_requests_updated_at
    BEFORE UPDATE ON advance_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_advance_requests_updated_at();

COMMIT;
