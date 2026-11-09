BEGIN;
CREATE TABLE stock_revaluations (
 id BIGSERIAL PRIMARY KEY, inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
 stock_qty NUMERIC(10,4) NOT NULL, previous_cost NUMERIC(10,2) NOT NULL, new_cost NUMERIC(10,2) NOT NULL,
 value_change NUMERIC(12,2) NOT NULL, reason TEXT NOT NULL, journal_entry_id UUID REFERENCES journal_entries(id),
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
UPDATE stock_movements SET quantity_change=-abs(quantity_change) WHERE movement_type IN ('ADJ_OUT','SALE','WASTAGE') AND quantity_change>0;
COMMIT;
