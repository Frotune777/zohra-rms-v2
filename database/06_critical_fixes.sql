-- 06_critical_fixes.sql
-- Hardening schema based on critical gap analysis
-- WARNING: This script may require data truncation if compatible data doesn't exist.

-- ==========================================
-- 1. Financial Module Integration
-- ==========================================

-- Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50),
    bank_name VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'INR',
    account_code INT REFERENCES chart_of_accounts(code), -- Link to GL Asset
    current_balance NUMERIC(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tax Rates
CREATE TABLE IF NOT EXISTS tax_rates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- e.g. "GST 5%", "VAT 10%"
    rate_percentage NUMERIC(5, 4) NOT NULL, -- 0.05 for 5%
    account_code INT REFERENCES chart_of_accounts(code), -- Link to GL Liability
    is_active BOOLEAN DEFAULT TRUE
);

-- Link Vendor Ledger to Journal Entries
ALTER TABLE vendor_ledger
ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);

-- ==========================================
-- 2. Salary Advances Refactor
-- ==========================================

-- Update salary_advances structure
ALTER TABLE salary_advances
ADD COLUMN IF NOT EXISTS balance_remaining NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active', -- Active, Repaid, WrittenOff
ADD COLUMN IF NOT EXISTS total_repaid NUMERIC(10, 2) DEFAULT 0.00;

-- Drop is_recovered if it exists (it was boolean)
ALTER TABLE salary_advances DROP COLUMN IF EXISTS is_recovered;

-- Link Advance Ledger to specific Salary Advance
ALTER TABLE advance_ledger
ADD COLUMN IF NOT EXISTS salary_advance_id INT REFERENCES salary_advances(id);

-- ==========================================
-- 3. Operational Data (Customers & Orders)
-- ==========================================

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(100),
    address TEXT,
    loyalty_points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES customers(id);

-- ==========================================
-- 4. Vendor Bill Approval
-- ==========================================

-- Supplier Items Master
CREATE TABLE IF NOT EXISTS supplier_items (
    id SERIAL PRIMARY KEY,
    supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
    item_code VARCHAR(50),
    item_name VARCHAR(100) NOT NULL,
    default_price NUMERIC(10, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(supplier_id, item_name)
);

-- Bill Approval Workflow
ALTER TABLE bill_entries
ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- ==========================================
-- 5. HR Compliance
-- ==========================================

-- Employee Documents
CREATE TABLE IF NOT EXISTS employee_documents (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL, -- Passport, Visa, ID
    document_number VARCHAR(100),
    expiry_date DATE,
    file_path TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Employee Shifts
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50), -- e.g. "Morning Shift"
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_overnight BOOLEAN DEFAULT FALSE
);

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS visa_expiry DATE,
ADD COLUMN IF NOT EXISTS work_permit_expiry DATE,
ADD COLUMN IF NOT EXISTS health_card_expiry DATE,
ADD COLUMN IF NOT EXISTS shift_id INT REFERENCES shifts(id);

-- ==========================================
-- 6. Detailed Payroll
-- ==========================================

-- Salary Components (Earnings/Deductions)
CREATE TABLE IF NOT EXISTS salary_components (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- Basic, HRA, Transport
    type VARCHAR(20) NOT NULL, -- Earning, Deduction
    is_taxable BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Employee Salary Structure
CREATE TABLE IF NOT EXISTS employee_salary_structure (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    component_id INT REFERENCES salary_components(id),
    amount NUMERIC(12, 2) NOT NULL,
    effective_date DATE DEFAULT CURRENT_DATE,
    UNIQUE(employee_id, component_id)
);

-- ==========================================
-- 7. Systemic Weaknesses
-- ==========================================

-- Financial Periods
CREATE TABLE IF NOT EXISTS financial_periods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50), -- "Jan 2025"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Open', -- Open, Locked, Closed
    locked_by INT REFERENCES users(id),
    locked_at TIMESTAMP
);

-- Audit Columns Helper Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Add audit columns to key tables if missing
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('employees', 'suppliers', 'inventory_items', 'menu_items', 'users')
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id)', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id)', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()', t);
        
        -- Create trigger for updated_at
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_modtime ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_modtime BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;
