-- Migration: Link Users to Employees
-- Goal: Enable Payroll to deduct outstanding wallet balances from linked Employee salary

BEGIN;

-- 1. Add employee_id column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id);

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

COMMIT;
