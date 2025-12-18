-- ===============================================
-- Migration: Add journal_entry_id to advance_ledger
-- Purpose: Link advance ledger entries to journal entries for audit trail
-- Author: Accounting System Refactor
-- Date: 2025-12-18
-- ===============================================

BEGIN;

-- Add journal_entry_id column to advance_ledger
ALTER TABLE advance_ledger
ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_advance_ledger_je 
ON advance_ledger(journal_entry_id) WHERE journal_entry_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN advance_ledger.journal_entry_id IS 'Link to journal entry created for this advance transaction';

COMMIT;

-- Rollback instructions:
-- ALTER TABLE advance_ledger DROP COLUMN IF EXISTS journal_entry_id;
