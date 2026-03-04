-- Add created_by column to vendor_ledger for audit tracking
ALTER TABLE vendor_ledger 
ADD COLUMN created_by INTEGER REFERENCES users(id);

CREATE INDEX idx_vendor_ledger_created_by ON vendor_ledger(created_by);
