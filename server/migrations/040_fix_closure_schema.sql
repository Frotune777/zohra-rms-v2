-- Migration: Fix Day Closure Schema
-- Goal: Support closure for ANY account (e.g., Manager Wallets), not just generic 'Counter'/'Float'

BEGIN;

-- 1. Add account_code column
ALTER TABLE daily_balances 
ADD COLUMN IF NOT EXISTS account_code INTEGER;

-- 2. Populate account_code for existing records
-- Counter -> 1000 (Main Safe)
-- Float -> 1030 (Manager Float - Legacy)
UPDATE daily_balances 
SET account_code = 1000 
WHERE type = 'Counter';

UPDATE daily_balances 
SET account_code = 1030 
WHERE type = 'Float';

-- 3. Drop existing constraints
ALTER TABLE daily_balances 
DROP CONSTRAINT IF EXISTS daily_balances_date_type_key;

-- We also need to drop the CHECK constraint on 'type' if it exists.
-- It is usually named 'daily_balances_type_check' or auto-generated.
-- We can alter the column or drop the constraint by name.
-- Since names vary, we'll try to drop the common name or just alter the column to TEXT/VARCHAR without check.
DO $$ 
DECLARE constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint 
    WHERE conrelid = 'daily_balances'::regclass AND contype = 'c' AND conname LIKE '%type%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE daily_balances DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

-- 4. Add new UNIQUE constraint on (date, account_code)
-- We KEEP 'type' as a descriptive label (user can still send 'Counter'/'Float' for UI)
-- But the logic relies on account_code.
ALTER TABLE daily_balances 
ADD CONSTRAINT daily_balances_date_account_key UNIQUE (date, account_code);

-- 5. Ensure account_code is NOT NULL (after backfill)
ALTER TABLE daily_balances 
ALTER COLUMN account_code SET NOT NULL;

COMMIT;
