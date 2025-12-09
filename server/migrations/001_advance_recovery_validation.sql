-- Phase 1: Advance Recovery Validation - Database Constraints
-- Run this migration to add validation constraints

-- 1. Add constraint to ensure amount is always positive
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'advance_ledger_amount_positive'
    ) THEN
        ALTER TABLE advance_ledger 
        ADD CONSTRAINT advance_ledger_amount_positive CHECK (amount > 0);
    END IF;
END $$;

-- 2. Add index for performance on employee queries
CREATE INDEX IF NOT EXISTS idx_advance_ledger_employee_type 
ON advance_ledger(employee_id, transaction_type);

-- 3. Add index for date-based queries
CREATE INDEX IF NOT EXISTS idx_advance_ledger_date 
ON advance_ledger(transaction_date);

-- 4. Add source tag column to track repayment origin
ALTER TABLE advance_ledger 
ADD COLUMN IF NOT EXISTS repayment_source VARCHAR(50) 
CHECK (repayment_source IN ('Payroll', 'Manual', 'Cash', 'Retroactive', NULL));

-- Update existing repayments to tag them as retroactive
UPDATE advance_ledger 
SET repayment_source = 'Retroactive' 
WHERE transaction_type = 'Repayment' 
AND repayment_source IS NULL;

-- 6. Make notes required for manual repayments (will be enforced in backend)
-- Cannot enforce at DB level since we need conditional logic

COMMIT;
