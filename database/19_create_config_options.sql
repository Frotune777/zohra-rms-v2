-- Create centralized configuration table for all dropdown options
-- This serves as the single source of truth for all configurable dropdowns

CREATE TABLE IF NOT EXISTS config_options (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    value VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    CONSTRAINT unique_category_value UNIQUE(category, value)
);

CREATE INDEX idx_config_category ON config_options(category);
CREATE INDEX idx_config_active ON config_options(is_active);
CREATE INDEX idx_config_order ON config_options(category, display_order);

-- Seed initial configuration options
INSERT INTO config_options (category, value, label, display_order) VALUES
-- Item Categories
('item_categories', 'vegetables', 'Vegetables', 1),
('item_categories', 'dairy', 'Dairy Products', 2),
('item_categories', 'meat', 'Meat & Poultry', 3),
('item_categories', 'spices', 'Spices & Condiments', 4),
('item_categories', 'grains', 'Grains & Cereals', 5),
('item_categories', 'beverages', 'Beverages', 6),

-- Units of Measurement
('units', 'kg', 'Kilogram (kg)', 1),
('units', 'ltr', 'Liter (ltr)', 2),
('units', 'pcs', 'Pieces (pcs)', 3),
('units', 'dozen', 'Dozen', 4),
('units', 'gm', 'Gram (gm)', 5),
('units', 'ml', 'Milliliter (ml)', 6),

-- Payment Types
('payment_types', 'CASH', 'Cash', 1),
('payment_types', 'CREDIT', 'Credit', 2),
('payment_types', 'UPI', 'UPI', 3),
('payment_types', 'CARD', 'Card', 4),
('payment_types', 'CHEQUE', 'Cheque', 5),

-- Vendor Types
('vendor_types', 'CHICKEN', 'Chicken Supplier', 1),
('vendor_types', 'GROCERY', 'Grocery Supplier', 2),
('vendor_types', 'SUPPLIES', 'General Supplies', 3),
('vendor_types', 'DAIRY', 'Dairy Supplier', 4),
('vendor_types', 'VEGETABLES', 'Vegetable Supplier', 5),

-- Bill/Purchase Status
('bill_status', 'PENDING', 'Pending', 1),
('bill_status', 'APPROVED', 'Approved', 2),
('bill_status', 'REJECTED', 'Rejected', 3),
('bill_status', 'PAID', 'Paid', 4),

-- Employee Roles
('employee_roles', 'OWNER', 'Owner', 1),
('employee_roles', 'MANAGER', 'Manager', 2),
('employee_roles', 'STAFF', 'Staff', 3),
('employee_roles', 'CASHIER', 'Cashier', 4),
('employee_roles', 'CHEF', 'Chef', 5),

-- Base Rate Types (for markup calculations)
('base_rate_types', 'TandoorRate', 'Tandoor Rate', 1),
('base_rate_types', 'BoilerRate', 'Boiler Rate', 2),
('base_rate_types', 'EggRate', 'Egg Rate', 3),

-- Markup Operations
('markup_operations', '+', 'Add (+)', 1),
('markup_operations', '-', 'Subtract (-)', 2),
('markup_operations', '*', 'Multiply (×)', 3),
('markup_operations', '/', 'Divide (÷)', 4),

-- Threshold Operations
('threshold_operations', '>', 'Greater than (>)', 1),
('threshold_operations', '<', 'Less than (<)', 2),
('threshold_operations', '>=', 'Greater or Equal (≥)', 3),
('threshold_operations', '<=', 'Less or Equal (≤)', 4),
('threshold_operations', '==', 'Equal (=)', 5)

ON CONFLICT (category, value) DO NOTHING;

COMMENT ON TABLE config_options IS 'Centralized configuration for all dropdown options across the system';
COMMENT ON COLUMN config_options.category IS 'Category/type of configuration (e.g., item_categories, units)';
COMMENT ON COLUMN config_options.value IS 'Internal value used in code';
COMMENT ON COLUMN config_options.label IS 'Display label shown to users';
COMMENT ON COLUMN config_options.display_order IS 'Order in which options appear in dropdowns';
COMMENT ON COLUMN config_options.metadata IS 'Additional configuration data as JSON';
