-- Add bill_entry_id to vendor_ledger to track source of liability
ALTER TABLE vendor_ledger 
ADD COLUMN bill_entry_id INTEGER REFERENCES bill_entries(id) ON DELETE SET NULL;

CREATE INDEX idx_vendor_ledger_bill_entry ON vendor_ledger(bill_entry_id);
