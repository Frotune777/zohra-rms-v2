-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    supplier_id INT REFERENCES suppliers(id),
    status VARCHAR(20) DEFAULT 'Draft', -- Draft, Sent, Received, Cancelled
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INT REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id INT REFERENCES inventory_items(id),
    qty_ordered DECIMAL(10, 2) NOT NULL,
    qty_received DECIMAL(10, 2) DEFAULT 0,
    unit_cost DECIMAL(10, 2) NOT NULL
);

-- Wastage Tracking
CREATE TABLE IF NOT EXISTS wastage_logs (
    id SERIAL PRIMARY KEY,
    inventory_item_id INT REFERENCES inventory_items(id),
    qty DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(255), -- Expired, Spilled, Cooked Error, Theft
    cost DECIMAL(10, 2) NOT NULL,
    reported_by VARCHAR(100), -- User email or name
    created_at TIMESTAMP DEFAULT NOW()
);

-- KDS Tickets
CREATE TABLE IF NOT EXISTS kds_tickets (
    id SERIAL PRIMARY KEY,
    order_id INT, -- Can link to a future orders table if we make one, for now just an ID
    items JSONB, -- Array of items to cook
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Preparing, Done
    station VARCHAR(50) DEFAULT 'Kitchen',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
