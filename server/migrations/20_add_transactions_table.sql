-- [NEW] transactions table for the Daily Financial Tracker
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'Sales', 'Expense', 'Transfer' (Check constraint handled in app or we can add it here, let's add it for safety)
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20), -- 'Cash', 'Bank_Cash', 'Bank'
  status VARCHAR(20) DEFAULT 'Pending', -- 'Paid', 'Pending', 'Cancelled'
  description TEXT,
  category_id INTEGER, -- Optional link to categories if implemented
  metadata JSONB, -- For extra flexibility
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_transaction_type CHECK (type IN ('Sales', 'Expense', 'Transfer')),
  CONSTRAINT check_payment_method CHECK (payment_method IN ('Cash', 'Bank_Cash', 'Bank')),
  CONSTRAINT check_status CHECK (status IN ('Paid', 'Pending', 'Cancelled'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions (date, type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status, payment_method);
