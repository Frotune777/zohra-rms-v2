CREATE TYPE movement_type_enum AS ENUM ('ADJ_IN', 'ADJ_OUT', 'SALE', 'PURCHASE', 'WASTAGE');

CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    inventory_item_id INTEGER REFERENCES inventory_items(id),
    movement_type movement_type_enum NOT NULL,
    quantity_change DECIMAL(10, 2) NOT NULL,
    related_document_id VARCHAR(255), -- Can be Bill Entry ID, POS Transaction ID, etc.
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id)
);

CREATE INDEX idx_stock_movements_item_id ON stock_movements(inventory_item_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(created_at);
