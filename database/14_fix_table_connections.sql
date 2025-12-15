-- Migration: Fix Database Table Connections
-- Purpose: Add missing foreign key constraints to improve referential integrity
-- Date: 2025-12-14

-- ============================================================================
-- STEP 1: Clean up orphaned records before adding FK constraints
-- ============================================================================

-- Clean up kds_tickets with invalid order_id
DELETE FROM kds_tickets 
WHERE order_id IS NOT NULL 
  AND order_id NOT IN (SELECT id FROM orders);

-- Clean up vendor_payments with invalid journal_entry_id
UPDATE vendor_payments 
SET journal_entry_id = NULL 
WHERE journal_entry_id IS NOT NULL 
  AND journal_entry_id NOT IN (SELECT id FROM journal_entries);

-- ============================================================================
-- STEP 2: Add user tracking columns to tables
-- ============================================================================

-- Add user tracking to journal_entries
ALTER TABLE journal_entries 
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

-- Add user tracking to daily_balances
ALTER TABLE daily_balances 
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER,
ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER;

-- Add user tracking to transactions (if not exists)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

-- Add user tracking to transaction_categories
ALTER TABLE transaction_categories 
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

-- Add user tracking to vendor_payments (separate from created_by text field)
ALTER TABLE vendor_payments 
ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER;

-- Add user tracking to wastage_logs
ALTER TABLE wastage_logs 
ADD COLUMN IF NOT EXISTS reported_by_user_id INTEGER;

-- ============================================================================
-- STEP 3: Add foreign key constraints
-- ============================================================================

-- journal_entries -> users
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_journal_entries_created_by_user'
    ) THEN
        ALTER TABLE journal_entries 
        ADD CONSTRAINT fk_journal_entries_created_by_user 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- daily_balances -> users (created_by)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_daily_balances_created_by_user'
    ) THEN
        ALTER TABLE daily_balances 
        ADD CONSTRAINT fk_daily_balances_created_by_user 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- daily_balances -> users (updated_by)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_daily_balances_updated_by_user'
    ) THEN
        ALTER TABLE daily_balances 
        ADD CONSTRAINT fk_daily_balances_updated_by_user 
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- kds_tickets -> orders
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_kds_tickets_order'
    ) THEN
        ALTER TABLE kds_tickets 
        ADD CONSTRAINT fk_kds_tickets_order 
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    END IF;
END $$;

-- transactions -> users
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_transactions_created_by_user'
    ) THEN
        ALTER TABLE transactions 
        ADD CONSTRAINT fk_transactions_created_by_user 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- transaction_categories -> users
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_transaction_categories_created_by_user'
    ) THEN
        ALTER TABLE transaction_categories 
        ADD CONSTRAINT fk_transaction_categories_created_by_user 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- vendor_payments -> users
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_vendor_payments_created_by_user'
    ) THEN
        ALTER TABLE vendor_payments 
        ADD CONSTRAINT fk_vendor_payments_created_by_user 
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- vendor_payments -> journal_entries
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_vendor_payments_journal_entry'
    ) THEN
        ALTER TABLE vendor_payments 
        ADD CONSTRAINT fk_vendor_payments_journal_entry 
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;
    END IF;
END $$;

-- wastage_logs -> users
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_wastage_logs_reported_by_user'
    ) THEN
        ALTER TABLE wastage_logs 
        ADD CONSTRAINT fk_wastage_logs_reported_by_user 
        FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create indexes for better query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON journal_entries(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_balances_created_by ON daily_balances(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_balances_updated_by ON daily_balances(updated_by_user_id);
CREATE INDEX IF NOT EXISTS idx_kds_tickets_order ON kds_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_created_by ON transaction_categories(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_created_by ON vendor_payments(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_journal_entry ON vendor_payments(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_wastage_logs_reported_by ON wastage_logs(reported_by_user_id);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Display all foreign keys that were added
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu 
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu 
    ON ccu.constraint_name = tc.constraint_name 
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name IN (
        'journal_entries', 
        'daily_balances', 
        'kds_tickets', 
        'transactions', 
        'transaction_categories',
        'vendor_payments', 
        'wastage_logs'
    )
ORDER BY tc.table_name, kcu.column_name;
