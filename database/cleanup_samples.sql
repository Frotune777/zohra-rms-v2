-- Purge sample data while preserving users and system configuration
-- Target Database: alzohra_db
-- Last Modified: 2026-04-22

BEGIN;

-- Disable triggers to avoid foreign key constraints during truncate if necessary
-- (Using TRUNCATE CASCADE instead)

TRUNCATE TABLE 
    employees, 
    attendance, 
    journal_entries, 
    ledger_lines, 
    bill_entries, 
    vendor_ledger, 
    daily_rates,
    inventory_items,
    recipe_ingredients
RESTART IDENTITY CASCADE;


COMMIT;
