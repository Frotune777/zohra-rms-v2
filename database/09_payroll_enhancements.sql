-- Add payout_method to employees
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS payout_method VARCHAR(20) DEFAULT 'Cash';

-- Add overtime and extra day fields to salary_history
ALTER TABLE salary_history
ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS overtime_amount NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_days NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_day_amount NUMERIC(10, 2) DEFAULT 0;
