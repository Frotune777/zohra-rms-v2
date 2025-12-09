-- Add department column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'General';

-- Update existing records to have a default department if needed
UPDATE employees SET department = 'Kitchen' WHERE position IN ('Chef', 'Cook');
UPDATE employees SET department = 'Service' WHERE position IN ('Waiter', 'Waitress', 'Host');
UPDATE employees SET department = 'Management' WHERE role IN ('manager', 'owner');
