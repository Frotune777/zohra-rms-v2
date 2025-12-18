-- ===============================================
-- Migration: Expense Category Account Mapping
-- Purpose: Link transaction_categories to chart_of_accounts
-- Author: Accounting System Refactor
-- Date: 2025-12-18
-- ===============================================

BEGIN;

-- 1. Add account_code to transaction_categories
ALTER TABLE transaction_categories 
ADD COLUMN IF NOT EXISTS account_code INT REFERENCES chart_of_accounts(code);

-- 2. Update existing categories with proper GL account mappings
-- Income categories
UPDATE transaction_categories 
SET account_code = 4000 
WHERE name = 'Sales' AND type = 'Income';

UPDATE transaction_categories 
SET account_code = 4000 
WHERE name = 'Consulting' AND type = 'Income';

-- Expense categories (map to appropriate GL accounts)
UPDATE transaction_categories 
SET account_code = 5300 
WHERE name = 'Grocery' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 6100 
WHERE name = 'Labor' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 6300 
WHERE name = 'Utilities' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 6200 
WHERE name = 'Rent' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 6700 
WHERE name = 'Maintenance' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 6800 
WHERE name = 'Marketing' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 1010 
WHERE name = 'Bank Transfer' AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 6900 
WHERE name = 'Misc' AND type = 'Expense';

-- 3. Set account_code as NOT NULL for future categories
-- First, handle any remaining NULL values with a default misc account
UPDATE transaction_categories 
SET account_code = 6900 
WHERE account_code IS NULL AND type = 'Expense';

UPDATE transaction_categories 
SET account_code = 4000 
WHERE account_code IS NULL AND type = 'Income';

-- Now make it required
ALTER TABLE transaction_categories 
ALTER COLUMN account_code SET NOT NULL;

-- 4. Create index for performance
CREATE INDEX IF NOT EXISTS idx_transaction_categories_account 
ON transaction_categories(account_code);

-- 5. Add constraint to ensure Income maps to Revenue accounts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_income_revenue_account'
    ) THEN
        ALTER TABLE transaction_categories
        ADD CONSTRAINT chk_income_revenue_account
        CHECK (
            (type = 'Income' AND account_code >= 4000 AND account_code < 5000)
            OR type != 'Income'
        );
    END IF;
END $$;

-- 6. Add constraint to ensure Expense maps to Expense/COGS accounts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_expense_expense_account'
    ) THEN
        ALTER TABLE transaction_categories
        ADD CONSTRAINT chk_expense_expense_account
        CHECK (
            (type = 'Expense' AND account_code >= 5000)
            OR type != 'Expense'
        );
    END IF;
END $$;

-- 7. Verification
DO $$
DECLARE
    unmapped_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO unmapped_count 
    FROM transaction_categories 
    WHERE account_code IS NULL;
    
    IF unmapped_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: % categories still unmapped', unmapped_count;
    END IF;
    
    RAISE NOTICE 'Successfully mapped all transaction categories to GL accounts';
END $$;

COMMIT;

-- Rollback instructions:
-- ALTER TABLE transaction_categories DROP COLUMN IF EXISTS account_code;
