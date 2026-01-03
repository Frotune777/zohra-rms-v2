-- Migration: Owner Equity Tracking
-- Purpose: Create Equity accounts for Owners to track investments/drawings separately
-- Date: 2026-01-04

BEGIN;

-- 1. Ensure Parent Equity Account Exists
INSERT INTO chart_of_accounts (code, name, type)
VALUES (3000, 'Owner''s Equity', 'Equity')
ON CONFLICT (code) DO NOTHING;

-- 2. Create Equity Accounts for Existing Owners
-- We iterate through users with role 'owner' and assign them a unique 3XXX code
DO $$
DECLARE
    owner_rec RECORD;
    new_account_code INTEGER;
BEGIN
    -- Start allocating from 3001
    new_account_code := 3001;

    FOR owner_rec IN SELECT id, full_name, ledger_account_code FROM users WHERE role = 'owner' ORDER BY id LOOP
        
        -- If user doesn't have a ledger code or it's not in 3000 range, assign a new one
        IF owner_rec.ledger_account_code IS NULL OR owner_rec.ledger_account_code < 3000 OR owner_rec.ledger_account_code >= 4000 THEN
            
            -- Find next available code
            WHILE EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = new_account_code) LOOP
                new_account_code := new_account_code + 1;
            END LOOP;

            -- Create Account
            INSERT INTO chart_of_accounts (code, name, type)
            VALUES (new_account_code, owner_rec.full_name || ' - Equity/Drawings', 'Equity');

            -- Update User Profile
            UPDATE users 
            SET ledger_account_code = new_account_code 
            WHERE id = owner_rec.id;
            
            RAISE NOTICE 'Created Equity Account % for Owner %', new_account_code, owner_rec.full_name;
        END IF;

    END LOOP;
END $$;

COMMIT;
