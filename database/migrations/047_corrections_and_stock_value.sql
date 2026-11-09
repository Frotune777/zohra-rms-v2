BEGIN;
-- Nullable until the first recorded write: existing stock needs reconciliation,
-- not a fabricated opening journal. Writers initialize from quantity * cost.
ALTER TABLE inventory_items ADD COLUMN stock_value NUMERIC(16,2) CHECK(stock_value>=0);
ALTER TABLE stock_adjustments ADD COLUMN value_change NUMERIC(16,2);
ALTER TABLE inventory_transactions ADD COLUMN value_change NUMERIC(16,2);
CREATE TABLE stock_receipts (
 id BIGSERIAL PRIMARY KEY, inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, quantity NUMERIC(10,4) NOT NULL CHECK(quantity>0),
 value NUMERIC(16,2) NOT NULL CHECK(value>=0), quantity_before NUMERIC(10,4) NOT NULL,
 value_before NUMERIC(16,2) NOT NULL, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
 UNIQUE(source_type,source_id,inventory_item_id)
);
CREATE TABLE stock_corrections (
 id BIGSERIAL PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
 inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id), quantity_change NUMERIC(10,4) NOT NULL,
 value_change NUMERIC(16,2) NOT NULL, journal_entry_id UUID REFERENCES journal_entries(id),
 reason TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
 UNIQUE(source_type,source_id,inventory_item_id)
);
CREATE TABLE advance_manual_allocations (
 id BIGSERIAL PRIMARY KEY, advance_request_id INTEGER NOT NULL REFERENCES advance_requests(id),
 salary_advance_id INTEGER NOT NULL REFERENCES salary_advances(id), amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 journal_entry_id UUID NOT NULL REFERENCES journal_entries(id), reversed BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(advance_request_id,salary_advance_id)
);
CREATE TABLE advance_repayment_reversals (
 id BIGSERIAL PRIMARY KEY, advance_request_id INTEGER NOT NULL UNIQUE REFERENCES advance_requests(id),
 journal_entry_id UUID NOT NULL REFERENCES journal_entries(id), reason TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE order_refunds (
 id BIGSERIAL PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
 amount NUMERIC(12,2) NOT NULL, receivable_cancelled NUMERIC(12,2) NOT NULL,
 return_stock BOOLEAN NOT NULL, reason TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payment_transactions ADD COLUMN refund_id BIGINT REFERENCES order_refunds(id);
COMMIT;
