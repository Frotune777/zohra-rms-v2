-- Al Zohra RMS Database Schema
-- Features: RBAC, Double-Entry Accounting, Recipe Costing, Payroll w/ Advances

-- 0. User Management & Authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('staff', 'manager', 'owner')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active'
);

-- 1. Finance (Chart of Accounts)
CREATE TABLE chart_of_accounts (
    code INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL -- Asset, Liability, Revenue, Expense
);

-- 2. Transactions (The Ledger)
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

CREATE TABLE ledger_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID REFERENCES journal_entries(id),
    account_code INT REFERENCES chart_of_accounts(code),
    debit NUMERIC(12, 2) DEFAULT 0,
    credit NUMERIC(12, 2) DEFAULT 0
);

-- 3. Inventory & Menu
CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE,
    stock_qty NUMERIC(10, 4) DEFAULT 0,
    unit_cost NUMERIC(10, 2) DEFAULT 0,
    unit VARCHAR(10)
);

CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    price NUMERIC(10, 2),
    category VARCHAR(50)
);

CREATE TABLE recipe_ingredients (
    menu_item_id INT REFERENCES menu_items(id),
    inventory_item_id INT REFERENCES inventory_items(id),
    quantity_required NUMERIC(10, 4),
    PRIMARY KEY (menu_item_id, inventory_item_id)
);

-- 4. HR & Payroll
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    position VARCHAR(50),
    age INT,
    gender VARCHAR(20),
    phone_number VARCHAR(20),
    role VARCHAR(20) DEFAULT 'staff',
    base_salary NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE salary_advances (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    amount NUMERIC(10, 2) NOT NULL,
    is_recovered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE salary_history (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    month INT NOT NULL,
    year INT NOT NULL,
    days_worked INT,
    calculated_salary NUMERIC(12, 2),
    advance_deduction NUMERIC(12, 2) DEFAULT 0,
    net_pay NUMERIC(12, 2),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, month, year)
);

-- SEED DATA -----------------------------------------------

-- Accounts
INSERT INTO chart_of_accounts (code, name, type) VALUES
(1000, 'Cash on Hand', 'Asset'),
(1100, 'Employee Advances Receivable', 'Asset'), -- Money owed by staff
(1200, 'Inventory Asset', 'Asset'),
(4000, 'Sales Revenue', 'Revenue'),
(5000, 'Cost of Goods Sold', 'Expense'),
(6000, 'Salaries Expense', 'Expense');

-- Inventory - Indian Restaurant Items
INSERT INTO inventory_items (name, stock_qty, unit_cost, unit) VALUES
('Chicken Breast', 50, 150.00, 'kg'),
('Basmati Rice', 100, 50.00, 'kg'),
('Naan Dough', 200, 15.00, 'pcs'),
('Onion', 80, 30.00, 'kg'),
('Tomato', 70, 40.00, 'kg'),
('Cream/Yogurt', 40, 80.00, 'ltr'),
('Spice Mix', 30, 200.00, 'kg'),
('Ghee', 20, 300.00, 'ltr'),
('Lentils', 50, 100.00, 'kg'),
('Paneer', 30, 250.00, 'kg'),
('Ginger-Garlic', 15, 50.00, 'kg'),
('Green Chili', 20, 40.00, 'kg'),
('Cilantro', 15, 30.00, 'kg'),
('Coconut Milk', 25, 60.00, 'ltr');

-- Menu - Indian Restaurant
INSERT INTO menu_items (name, price, category) VALUES
-- Biryani
('Chicken Biryani', 350.00, 'Biryani'),
('Mutton Biryani', 450.00, 'Biryani'),
('Vegetable Biryani', 280.00, 'Biryani'),
-- Curries
('Butter Chicken', 380.00, 'Curry'),
('Paneer Tikka Masala', 320.00, 'Curry'),
('Dal Makhani', 220.00, 'Curry'),
('Chole Bhature', 150.00, 'Curry'),
('Shahi Paneer', 300.00, 'Curry'),
-- Breads
('Plain Naan', 60.00, 'Bread'),
('Garlic Naan', 80.00, 'Bread'),
('Butter Naan', 80.00, 'Bread'),
('Tandoori Roti', 50.00, 'Bread'),
-- Starters
('Samosa (2 pcs)', 80.00, 'Starter'),
('Pakora Mix', 120.00, 'Starter'),
('Paneer Tikka', 200.00, 'Starter'),
-- Dosas & Uttapam
('Plain Dosa', 120.00, 'South Indian'),
('Masala Dosa', 140.00, 'South Indian'),
('Cheese Dosa', 160.00, 'South Indian'),
-- Beverages
('Lassi (Sweet)', 80.00, 'Beverage'),
('Masala Chai', 50.00, 'Beverage'),
('Mango Shake', 120.00, 'Beverage');

-- Recipes - Simplified (linking menu items to inventory)
-- Menu items are numbered sequentially in order of insertion
-- 1: Chicken Biryani, 2: Mutton Biryani, 3: Vegetable Biryani, 4: Butter Chicken, 5: Paneer Tikka Masala
-- 6: Dal Makhani, 7: Chole Bhature, 8: Shahi Paneer, 9: Plain Naan, 10: Garlic Naan
-- 11: Butter Naan, 12: Tandoori Roti, 13: Samosa, 14: Pakora Mix, 15: Paneer Tikka (Starter)
-- 16: Plain Dosa, 17: Masala Dosa, 18: Cheese Dosa, 19: Lassi, 20: Masala Chai, 21: Mango Shake

INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES
-- Chicken Biryani (1: Chicken, 2: Rice, 7: Spice Mix, 8: Ghee)
(1, 1, 0.25), (1, 2, 0.3), (1, 7, 0.02), (1, 8, 0.05),
-- Mutton Biryani (1: Chicken->Meat, 2: Rice, 7: Spice Mix, 8: Ghee)
(2, 1, 0.3), (2, 2, 0.3), (2, 7, 0.02), (2, 8, 0.05),
-- Vegetable Biryani (2: Rice, 4: Onion, 5: Tomato, 7: Spice, 8: Ghee)
(3, 2, 0.3), (3, 4, 0.15), (3, 5, 0.1), (3, 7, 0.02), (3, 8, 0.03),
-- Butter Chicken (1: Chicken, 4: Onion, 5: Tomato, 6: Cream, 7: Spice, 8: Ghee)
(4, 1, 0.3), (4, 4, 0.1), (4, 5, 0.15), (4, 6, 0.1), (4, 7, 0.02), (4, 8, 0.03),
-- Paneer Tikka Masala (10: Paneer, 4: Onion, 5: Tomato, 6: Cream, 7: Spice, 8: Ghee)
(5, 10, 0.2), (5, 4, 0.1), (5, 5, 0.15), (5, 6, 0.1), (5, 7, 0.02), (5, 8, 0.03),
-- Dal Makhani (9: Lentils, 6: Cream, 8: Ghee, 7: Spice)
(6, 9, 0.15), (6, 6, 0.1), (6, 8, 0.02), (6, 7, 0.01),
-- Chole Bhature (9: Lentils, 4: Onion, 6: Cream, 7: Spice)
(7, 9, 0.15), (7, 4, 0.1), (7, 6, 0.05), (7, 7, 0.01),
-- Shahi Paneer (10: Paneer, 4: Onion, 6: Cream, 8: Ghee, 7: Spice)
(8, 10, 0.2), (8, 4, 0.1), (8, 6, 0.15), (8, 8, 0.03), (8, 7, 0.01),
-- Plain Naan (3: Naan Dough, 8: Ghee)
(9, 3, 1), (9, 8, 0.01),
-- Garlic Naan (3: Naan Dough, 8: Ghee, 11: Ginger-Garlic)
(10, 3, 1), (10, 8, 0.02), (10, 11, 0.02),
-- Butter Naan (3: Naan Dough, 8: Ghee)
(11, 3, 1), (11, 8, 0.03),
-- Tandoori Roti (3: Naan Dough)
(12, 3, 1),
-- Samosa (3: Naan Dough, 4: Onion, 7: Spice)
(13, 3, 0.5), (13, 4, 0.05), (13, 7, 0.01),
-- Pakora Mix (3: Naan Dough, 4: Onion, 7: Spice)
(14, 3, 0.5), (14, 4, 0.1), (14, 7, 0.02),
-- Paneer Tikka Starter (10: Paneer, 4: Onion, 5: Tomato, 11: Ginger-Garlic)
(15, 10, 0.15), (15, 4, 0.1), (15, 5, 0.1), (15, 11, 0.02),
-- Plain Dosa (2: Rice, 9: Lentils)
(16, 2, 0.1), (16, 9, 0.05),
-- Masala Dosa (2: Rice, 9: Lentils, 4: Onion, 5: Tomato)
(17, 2, 0.1), (17, 9, 0.05), (17, 4, 0.1), (17, 5, 0.05),
-- Cheese Dosa (2: Rice, 9: Lentils, 4: Onion, 10: Paneer)
(18, 2, 0.1), (18, 9, 0.05), (18, 4, 0.1), (18, 10, 0.05),
-- Lassi (6: Yogurt)
(19, 6, 0.2),
-- Masala Chai (6: Yogurt for base)
(20, 6, 0.1),
-- Mango Shake (6: Yogurt)
(21, 6, 0.15);

-- Employees
INSERT INTO employees (full_name, first_name, last_name, position, age, gender, phone_number, role, base_salary, status) VALUES
('John Doe', 'John', 'Doe', 'Chef', 35, 'Male', '9876543210', 'staff', 30000.00, 'active'),
('Jane Smith', 'Jane', 'Smith', 'Waitress', 28, 'Female', '9876543211', 'staff', 20000.00, 'active'),
('Raj Patel', 'Raj', 'Patel', 'Manager', 42, 'Male', '9876543212', 'manager', 35000.00, 'active'),
('Priya Singh', 'Priya', 'Singh', 'Host', 24, 'Female', '9876543213', 'staff', 18000.00, 'active'),
('Arjun Kumar', 'Arjun', 'Kumar', 'Cook', 32, 'Male', '9876543214', 'staff', 25000.00, 'active');

-- Users (with proper bcrypt hashes)
-- owner123 hash: $2a$10$HoHRJSfodzdGAF8yB2GoLuY8WwxCh0dHyv2AFJ7kuE.grjpOiTZUm
-- manager123 hash: $2a$10$cx9wULJuVc8DIs7wKRFEzuI1jOLzHq1TsvffXwGvbMZG.J7oUv/c2
-- staff123 hash: $2a$10$8X2BkGOGxaBQleQy.1Ij1usxft40l.1TawtoAU3gqI/NziDtHPwWG
INSERT INTO users (email, password_hash, full_name, role, status) VALUES
('owner@alzohra.com', '$2a$10$HoHRJSfodzdGAF8yB2GoLuY8WwxCh0dHyv2AFJ7kuE.grjpOiTZUm', 'Owner User', 'owner', 'active'),
('manager@alzohra.com', '$2a$10$cx9wULJuVc8DIs7wKRFEzuI1jOLzHq1TsvffXwGvbMZG.J7oUv/c2', 'Manager User', 'manager', 'active'),
('staff@alzohra.com', '$2a$10$8X2BkGOGxaBQleQy.1Ij1usxft40l.1TawtoAU3gqI/NziDtHPwWG', 'Staff User', 'staff', 'active');

-- 5. Chicken Rate & Bill Tracker
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    payment_type VARCHAR(50),
    vendor_type VARCHAR(50) NOT NULL,
    markup_required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE markup_rules (
    id SERIAL PRIMARY KEY,
    supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
    item_name VARCHAR(100) NOT NULL,
    base_rate_type VARCHAR(50) NOT NULL, -- 'TandoorRate', 'BoilerRate', 'EggRate'
    op1 VARCHAR(5), -- '+', '-', '*', '/'
    val1 NUMERIC(10, 2),
    op2 VARCHAR(5),
    val2 NUMERIC(10, 2),
    threshold_val NUMERIC(10, 2),
    threshold_op VARCHAR(5) DEFAULT '>',
    threshold_markup_op VARCHAR(5),
    threshold_markup_val NUMERIC(10, 2),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_id, item_name)
);

CREATE TABLE daily_rates (
    date DATE PRIMARY KEY,
    tandoor_rate NUMERIC(10, 2) NOT NULL,
    boiler_rate NUMERIC(10, 2) NOT NULL,
    egg_rate NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bill_entries (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    supplier_id INT REFERENCES suppliers(id),
    item_name VARCHAR(100) NOT NULL,
    qty NUMERIC(10, 2) NOT NULL,
    vendor_rate NUMERIC(10, 2) NOT NULL,
    expected_rate NUMERIC(10, 2) NOT NULL,
    variance NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vendor_ledger (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    supplier_id INT REFERENCES suppliers(id),
    transaction_type VARCHAR(50) NOT NULL, -- 'Bill', 'Payment'
    amount NUMERIC(12, 2) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    employee_id INT REFERENCES employees(id),
    status VARCHAR(20) NOT NULL, -- 'Present', 'Absent', 'Half-Day'
    check_in TIME,
    check_out TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, employee_id)
);