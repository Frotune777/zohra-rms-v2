-- Create Expense Mappings Table
CREATE TABLE IF NOT EXISTS expense_mappings (
    id SERIAL PRIMARY KEY,
    item_keyword VARCHAR(255) UNIQUE NOT NULL, -- e.g., "Tomato" or "Uber"
    category_id INTEGER REFERENCES transaction_categories(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup during typing
CREATE INDEX idx_expense_mappings_keyword ON expense_mappings(item_keyword);

-- Seed some initial mappings if categories exist (Generic example, adjust IDs as needed)
-- Assuming common categories exist. We use DO block to avoid errors if cats don't exist.
DO $$
DECLARE
    cat_grocery INTEGER;
    cat_labor INTEGER;
    cat_transport INTEGER;
BEGIN
    SELECT id INTO cat_grocery FROM transaction_categories WHERE name = 'Grocery' LIMIT 1;
    SELECT id INTO cat_labor FROM transaction_categories WHERE name = 'Labor' LIMIT 1;
    SELECT id INTO cat_transport FROM transaction_categories WHERE name = 'Transportation' LIMIT 1;

    IF cat_grocery IS NOT NULL THEN
        INSERT INTO expense_mappings (item_keyword, category_id) VALUES 
        ('Milk', cat_grocery),
        ('Bread', cat_grocery),
        ('Vegetables', cat_grocery)
        ON CONFLICT (item_keyword) DO NOTHING;
    END IF;

    IF cat_labor IS NOT NULL THEN
         INSERT INTO expense_mappings (item_keyword, category_id) VALUES 
        ('Daily Wage', cat_labor),
        ('Helper', cat_labor)
        ON CONFLICT (item_keyword) DO NOTHING;
    END IF;

    IF cat_transport IS NOT NULL THEN
         INSERT INTO expense_mappings (item_keyword, category_id) VALUES 
        ('Auto', cat_transport),
        ('Fuel', cat_transport)
        ON CONFLICT (item_keyword) DO NOTHING;
    END IF;
END $$;
