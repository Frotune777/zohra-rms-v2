-- Fix journal_entry_id type mismatch
BEGIN;

-- 1. Alter vendor_payments table
-- Drop and recreate is safer/cleaner when shifting from Int to UUID if data is incompatible
ALTER TABLE vendor_payments 
ALTER COLUMN journal_entry_id TYPE UUID USING NULL::UUID;

-- 2. Alter ledger_lines table
ALTER TABLE ledger_lines 
ALTER COLUMN journal_entry_id TYPE UUID USING NULL::UUID;

COMMIT;
