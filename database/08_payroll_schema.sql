-- Add bank details to employees
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(50),
ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20);

-- Enhance salary_history table
ALTER TABLE salary_history
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Paid
ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS allowances JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS payslip_url TEXT;

-- Create index for faster payroll queries
CREATE INDEX IF NOT EXISTS idx_salary_history_month_year ON salary_history(month, year);
CREATE INDEX IF NOT EXISTS idx_salary_history_status ON salary_history(status);
