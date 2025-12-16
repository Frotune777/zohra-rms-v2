-- 09 Audit System

BEGIN;

-- 1. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    record_id TEXT NOT NULL,
    action VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    changed_by_user_id INTEGER, -- If we can capture it from session/context (Advanced: requires setting variable in transaction)
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_date ON audit_logs(changed_at);

-- 2. Create Generic Audit Trigger Function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB;
    new_val JSONB;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        old_val = to_jsonb(OLD);
        new_val = to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        old_val = to_jsonb(OLD);
        new_val = null;
    ELSIF (TG_OP = 'INSERT') THEN
        old_val = null;
        new_val = to_jsonb(NEW);
    END IF;

    -- Insert into Audit Log
    -- Note: changed_by_user_id is hard to get generic from simple trigger without app context setting.
    -- We will leave it null for now or rely on app to set current_setting if implemented.
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME, COALESCE(NEW.id::text, OLD.id::text), TG_OP, old_val, new_val);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Apply Triggers to Critical Tables
-- Menu Items (Price changes)
DROP TRIGGER IF EXISTS audit_menu_items ON menu_items;
CREATE TRIGGER audit_menu_items
AFTER INSERT OR UPDATE OR DELETE ON menu_items
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Employees (Salary/Status changes)
DROP TRIGGER IF EXISTS audit_employees ON employees;
CREATE TRIGGER audit_employees
AFTER INSERT OR UPDATE OR DELETE ON employees
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Users (Role changes)
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Suppliers (Contact/Markup changes)
DROP TRIGGER IF EXISTS audit_suppliers ON suppliers;
CREATE TRIGGER audit_suppliers
AFTER INSERT OR UPDATE OR DELETE ON suppliers
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

COMMIT;
