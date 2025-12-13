CREATE TYPE transaction_status_enum AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED');

CREATE TABLE IF NOT EXISTS pos_transactions (
    id SERIAL PRIMARY KEY,
    transaction_uuid UUID DEFAULT gen_random_uuid() UNIQUE,
    total_amount DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL, -- 'CASH', 'CARD', 'UPI', etc.
    status transaction_status_enum DEFAULT 'PENDING',
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pos_transaction_items (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES pos_transactions(id),
    menu_item_id INTEGER REFERENCES menu_items(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    kitchen_notes TEXT
);

CREATE INDEX idx_pos_transactions_date ON pos_transactions(created_at);
CREATE INDEX idx_pos_transactions_uuid ON pos_transactions(transaction_uuid);
