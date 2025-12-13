-- Add vendor_id to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS vendor_id INTEGER;

-- Add foreign key constraint
ALTER TABLE transactions 
ADD CONSTRAINT fk_transactions_vendor 
FOREIGN KEY (vendor_id) 
REFERENCES suppliers(id) 
ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON transactions(vendor_id);
