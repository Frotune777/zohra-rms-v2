BEGIN;
INSERT INTO chart_of_accounts(code,name,type) VALUES
(1110,'Employee Payroll Shortfalls Receivable','Asset'),
(1120,'Customer Orders Receivable','Asset'),
(2100,'Sales Tax Payable','Liability'),
(6200,'Inventory Adjustment Expense','Expense') ON CONFLICT(code) DO NOTHING;
ALTER TABLE salary_history ADD COLUMN IF NOT EXISTS paid_leave_days NUMERIC(5,2) DEFAULT 0;
ALTER TABLE salary_history ADD COLUMN IF NOT EXISTS attendance_missing BOOLEAN DEFAULT FALSE;
CREATE TABLE payroll_shortfalls (
 id BIGSERIAL PRIMARY KEY, salary_history_id INTEGER NOT NULL, employee_id INTEGER NOT NULL REFERENCES employees(id),
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0), settled_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(settled_amount>=0 AND settled_amount<=amount),
 status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Settled','Reversed')),
 journal_entry_id UUID NOT NULL REFERENCES journal_entries(id), created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX payroll_shortfall_active ON payroll_shortfalls(salary_history_id) WHERE status<>'Reversed';
CREATE TABLE payroll_shortfall_settlements (
 id BIGSERIAL PRIMARY KEY, shortfall_id BIGINT NOT NULL REFERENCES payroll_shortfalls(id), amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 payment_mode TEXT NOT NULL, journal_entry_id UUID NOT NULL REFERENCES journal_entries(id), created_by INTEGER REFERENCES users(id),
 reference TEXT NOT NULL UNIQUE, reversed BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE wallet_transfer_history (
 id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
 direction TEXT NOT NULL CHECK(direction IN ('In','Out')), amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 balance_before NUMERIC(12,2) NOT NULL, balance_after NUMERIC(12,2) NOT NULL, performed_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'Dine In';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Paid';
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX order_payment_retry ON payment_transactions(order_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE tax_rates ADD COLUMN IF NOT EXISTS account_code INTEGER REFERENCES chart_of_accounts(code);
UPDATE tax_rates SET account_code=2100 WHERE account_code IS NULL;
CREATE UNIQUE INDEX kds_one_ticket_per_order ON kds_tickets(order_id);
ALTER TABLE kds_tickets ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
CREATE TABLE stock_adjustments (
 id BIGSERIAL PRIMARY KEY, inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
 quantity_change NUMERIC(10,4) NOT NULL CHECK(quantity_change<>0), quantity_before NUMERIC(10,4) NOT NULL, quantity_after NUMERIC(10,4) NOT NULL CHECK(quantity_after>=0),
 unit_cost NUMERIC(10,2) NOT NULL, reason TEXT NOT NULL, journal_entry_id UUID REFERENCES journal_entries(id),
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE stock_movements ALTER COLUMN quantity_change TYPE NUMERIC(10,4);
ALTER TABLE inventory_transactions ALTER COLUMN quantity TYPE NUMERIC(10,4);
ALTER TABLE wastage_logs ALTER COLUMN qty TYPE NUMERIC(10,4);
COMMIT;
