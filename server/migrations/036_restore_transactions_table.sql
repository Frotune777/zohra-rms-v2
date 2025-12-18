-- Restore transactions table (COMBINED FIX)
-- Combined from migrations 20, 21, 22 and fixed constraints

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  type VARCHAR(50) NOT NULL, -- Increased length, removed strict constraint for flexibility
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50), -- Increased length, removed strict constraint
  status VARCHAR(20) DEFAULT 'Pending',
  description TEXT,
  category_id INTEGER,
  metadata JSONB,
  paid_by VARCHAR(100),
  paid_date DATE,
  vendor_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Drop old constraints if they exist (safe cleanup)
DO $$ BEGIN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_payment_method;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions (date, type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status, payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON transactions(vendor_id);

-- Foreign Key
DO $$ BEGIN
    ALTER TABLE transactions 
    ADD CONSTRAINT fk_transactions_vendor 
    FOREIGN KEY (vendor_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
