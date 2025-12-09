-- Add all missing columns to employees table

-- Add employee_code if not exists
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS employee_code VARCHAR(20) UNIQUE;

-- Add government ID fields
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS govt_id_type VARCHAR(20);

ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS govt_id_number VARCHAR(50);

-- Generate employee codes for existing employees
UPDATE employees 
SET employee_code = 'EMP' || LPAD(id::text, 4, '0')
WHERE employee_code IS NULL;
