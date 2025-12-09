-- Add missing columns to salary_history table

ALTER TABLE salary_history 
ADD COLUMN IF NOT EXISTS manual_adjustment DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE salary_history 
ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;
