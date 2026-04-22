-- File: database/23_employee_history.sql
-- Purpose: Create audit log table for employee record changes.

CREATE TABLE IF NOT EXISTS employee_history (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id),
    field_changed VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(50) DEFAULT 'system_migration',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
