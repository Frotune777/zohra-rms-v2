-- Add balance_after column to advance_ledger
ALTER TABLE advance_ledger 
ADD COLUMN IF NOT EXISTS balance_after DECIMAL(10, 2) DEFAULT 0;

-- Recalculate balances for existing records (simplified)
-- In a real scenario, this would need a recursive query or cursor
-- For now, we'll just set it to 0 or update it based on simple logic if needed
