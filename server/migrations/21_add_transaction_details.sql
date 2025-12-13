-- Add paid_by and paid_date columns to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS paid_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS paid_date DATE;

-- Update constraints if necessary (removing old check constraints if they conflict)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_payment_method;
-- We are not adding a strict constraint yet to allow flexibility as requested by user
