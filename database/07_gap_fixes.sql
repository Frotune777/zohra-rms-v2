-- Critical Gap Fixes Migration

BEGIN;

-- 1. Payment Transactions (P0) --
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id INTEGER REFERENCES orders(id),
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- Cash, Card, UPI, etc.
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Completed', -- Completed, Pending, Failed
    reference_number VARCHAR(100), -- Transaction ID for cards/UPI
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by order
CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(order_id);

-- 2. Inventory Transactions (P0) --
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id INTEGER REFERENCES inventory_items(id),
    transaction_type VARCHAR(50) NOT NULL, -- 'Sale' (Deduction), 'Purchase' (Addition), 'Wastage', 'Adjustment'
    quantity DECIMAL(10,3) NOT NULL, -- Positive for add, Negative for deduct
    unit_cost DECIMAL(10,2), -- Cost at time of transaction
    reference_id VARCHAR(100), -- Order ID, PO ID, or Wastage ID
    reference_type VARCHAR(50), -- 'Order', 'PurchaseOrder', 'WastageLog'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_transactions_item_id ON inventory_transactions(inventory_item_id);
CREATE INDEX idx_inventory_transactions_created_at ON inventory_transactions(created_at);

-- 3. Salary Components (P1) --
CREATE TABLE IF NOT EXISTS salary_components_master (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'Earning', 'Deduction'
    is_active BOOLEAN DEFAULT TRUE,
    default_amount DECIMAL(10,2) DEFAULT 0
);

-- Seed basic components
INSERT INTO salary_components_master (name, type) VALUES 
('Basic Salary', 'Earning'),
('HRA', 'Earning'),
('Transport Allowance', 'Earning'),
('PF', 'Deduction'),
('Professional Tax', 'Deduction')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS salary_history_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salary_history_id INTEGER REFERENCES salary_history(id) ON DELETE CASCADE,
    component_name VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'Earning', 'Deduction'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_salary_history_components_history_id ON salary_history_components(salary_history_id);

-- 4. Finance Links (P0) --
ALTER TABLE bill_entries ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE wastage_logs ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);

-- 5. Tax Logic (P1) -- 
-- Ensure tax_rates table exists (should be there from previous, but safe keep)
CREATE TABLE IF NOT EXISTS tax_rates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    rate_percent DECIMAL(5,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_rate_id INTEGER REFERENCES tax_rates(id);

-- Seed default GST rates
INSERT INTO tax_rates (name, rate_percentage) VALUES 
('GST 5%', 0.05),
('GST 18%', 0.18),
('None', 0.00)
ON CONFLICT DO NOTHING;


-- FUNCTION: Deduct Inventory on Order Completion (Placeholder for logic)
-- We will implement the actual logic in the application controller for better control over recipes, 
-- but we create the inventory_transactions table here to support it.

COMMIT;
