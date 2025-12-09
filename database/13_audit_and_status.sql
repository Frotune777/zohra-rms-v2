-- Migration 13: Add Audit Tracking and Status Fields
-- This migration adds updated_at, updated_by tracking to all chicken biller tables
-- and adds status tracking to daily_rates

-- 1. Add audit fields to suppliers table
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id);

-- 2. Add audit fields to markup_rules table
ALTER TABLE markup_rules 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id);

-- 3. Add status and audit fields to daily_rates table
ALTER TABLE daily_rates 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id);

-- 4. Add audit fields to bill_entries table
ALTER TABLE bill_entries 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- 5. Add audit fields to vendor_ledger table
ALTER TABLE vendor_ledger 
ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id);

-- 6. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_rates_date_desc ON daily_rates(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_rates_status ON daily_rates(status);
CREATE INDEX IF NOT EXISTS idx_bill_entries_date_supplier ON bill_entries(date DESC, supplier_id);
CREATE INDEX IF NOT EXISTS idx_bill_entries_status ON bill_entries(status);
CREATE INDEX IF NOT EXISTS idx_bill_entries_supplier ON bill_entries(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_supplier_date ON vendor_ledger(supplier_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_markup_rules_supplier ON markup_rules(supplier_id);

-- 7. Add CHECK constraint for daily_rates status
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_daily_rates_status'
    ) THEN
        ALTER TABLE daily_rates 
        ADD CONSTRAINT chk_daily_rates_status 
        CHECK (status IN ('pending', 'confirmed'));
    END IF;
END $$;

-- 8. Add CHECK constraint for bill_entries status
ALTER TABLE bill_entries 
DROP CONSTRAINT IF EXISTS chk_bill_entries_status;

ALTER TABLE bill_entries 
ADD CONSTRAINT chk_bill_entries_status 
CHECK (status IN ('Pending', 'Approved', 'Rejected'));

-- 9. Create trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 10. Create triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at 
    BEFORE UPDATE ON suppliers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markup_rules_updated_at ON markup_rules;
CREATE TRIGGER update_markup_rules_updated_at 
    BEFORE UPDATE ON markup_rules 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_rates_updated_at ON daily_rates;
CREATE TRIGGER update_daily_rates_updated_at 
    BEFORE UPDATE ON daily_rates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bill_entries_updated_at ON bill_entries;
CREATE TRIGGER update_bill_entries_updated_at 
    BEFORE UPDATE ON bill_entries 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON COLUMN suppliers.updated_at IS 'Timestamp of last update';
COMMENT ON COLUMN suppliers.updated_by IS 'User ID who last updated this record';
COMMENT ON COLUMN markup_rules.created_by IS 'User ID who created this rule';
COMMENT ON COLUMN markup_rules.updated_by IS 'User ID who last updated this rule';
COMMENT ON COLUMN daily_rates.status IS 'Status: pending or confirmed';
COMMENT ON COLUMN daily_rates.updated_by IS 'User ID who last updated rates';
COMMENT ON COLUMN bill_entries.approved_by IS 'User ID who approved this bill';
COMMENT ON COLUMN bill_entries.approved_at IS 'Timestamp when bill was approved';
