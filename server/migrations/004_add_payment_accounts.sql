-- Migration: Add Missing Account Codes for Vendor Payment System
-- This migration adds the missing account codes required by the vendor payment controller

BEGIN;

-- Add Bank Account (1010)
INSERT INTO chart_of_accounts (code, name, type)
VALUES (
    1010,
    'Bank Account',
    'Asset'
)
ON CONFLICT (code) DO NOTHING;

-- Add UPI Account (1020)
INSERT INTO chart_of_accounts (code, name, type)
VALUES (
    1020,
    'UPI/Digital Payments',
    'Asset'
)
ON CONFLICT (code) DO NOTHING;

-- Add Vendor Payable Account (2000)
INSERT INTO chart_of_accounts (code, name, type)
VALUES (
    2000,
    'Accounts Payable - Vendors',
    'Liability'
)
ON CONFLICT (code) DO NOTHING;

-- Verify the accounts were created
DO $$
DECLARE
    missing_accounts TEXT[];
BEGIN
    SELECT ARRAY_AGG(code::TEXT)
    INTO missing_accounts
    FROM (VALUES (1000), (1010), (1020), (2000)) AS required(code)
    WHERE NOT EXISTS (
        SELECT 1 FROM chart_of_accounts WHERE chart_of_accounts.code = required.code
    );
    
    IF missing_accounts IS NOT NULL THEN
        RAISE EXCEPTION 'Migration failed: Missing account codes: %', array_to_string(missing_accounts, ', ');
    END IF;
    
    RAISE NOTICE 'All required account codes are present';
END $$;

COMMIT;
