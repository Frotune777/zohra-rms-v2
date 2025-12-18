-- Fix daily_rates table - Add missing columns
-- This migration adds status and updated_by columns to daily_rates table

BEGIN;

-- Add status column to daily_rates
ALTER TABLE daily_rates 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- Add constraint for valid status values (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_daily_rate_status'
    ) THEN
        ALTER TABLE daily_rates 
        ADD CONSTRAINT valid_daily_rate_status 
        CHECK (status IN ('pending', 'approved', 'locked'));
    END IF;
END $$;

-- Create index on status
CREATE INDEX IF NOT EXISTS idx_daily_rates_status ON daily_rates(status);

COMMIT;
