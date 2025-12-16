-- Payroll Audit Log Table
-- Tracks all revert/delete actions for compliance and accountability

CREATE TABLE IF NOT EXISTS payroll_audit_log (
    id SERIAL PRIMARY KEY,
    salary_history_id INT,
    employee_id INT REFERENCES employees(id),
    action VARCHAR(50) NOT NULL, -- 'delete', 'revert_to_pending', 'revert_to_approved'
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    performed_by INT REFERENCES users(id),
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT NOT NULL,
    metadata JSONB -- Store previous record state for reference
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_audit_employee ON payroll_audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_date ON payroll_audit_log(performed_at);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_action ON payroll_audit_log(action);

-- Add comment for documentation
COMMENT ON TABLE payroll_audit_log IS 'Audit trail for all payroll revert and delete operations';
COMMENT ON COLUMN payroll_audit_log.metadata IS 'JSON snapshot of the salary_history record before deletion/revert';
