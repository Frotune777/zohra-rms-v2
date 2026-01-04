-- Add audit trail columns to daily_rates table
-- This tracks who last updated the rates and when

ALTER TABLE daily_rates 
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Update existing rows to have a timestamp
UPDATE daily_rates SET updated_at = NOW() WHERE updated_at IS NULL;

COMMENT ON COLUMN daily_rates.updated_by IS 'User ID who last updated the rates';
COMMENT ON COLUMN daily_rates.updated_at IS 'Timestamp of last rate update';
