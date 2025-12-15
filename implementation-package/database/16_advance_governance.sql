-- Migration: Advance Management Governance
-- Version: 16
-- Date: 2024-12-15
-- Description: Adds advance request workflow, repayment tracking, and governance features

BEGIN;

-- ============================================================================
-- 1. CREATE ADVANCE REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS advance_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    requested_amount DECIMAL(12,2) NOT NULL,
    approved_amount DECIMAL(12,2),
    reason TEXT NOT NULL,
    urgency VARCHAR(20) DEFAULT 'Normal', -- 'Urgent', 'Normal', 'Low'
    repayment_months INTEGER DEFAULT 3,
    monthly_deduction DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed'
    requested_by INTEGER REFERENCES users(id),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    disbursed_by INTEGER REFERENCES users(id),
    disbursed_at TIMESTAMP,
    disbursement_mode VARCHAR(50),
    disbursement_reference VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_amount CHECK (requested_amount > 0),
    CONSTRAINT valid_status CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Disbursed', 'Completed'))
);

CREATE INDEX idx_advance_requests_employee ON advance_requests(employee_id);
CREATE INDEX idx_advance_requests_status ON advance_requests(status);
CREATE INDEX idx_advance_requests_requested ON advance_requests(requested_at DESC);

-- ============================================================================
-- 2. CREATE ADVANCE REPAYMENT SCHEDULE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS advance_repayment_schedule (
    id SERIAL PRIMARY KEY,
    advance_request_id INTEGER NOT NULL REFERENCES advance_requests(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    month_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    scheduled_amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    payment_date DATE,
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Paid', 'Partial', 'Overdue'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_repayment_status CHECK (status IN ('Pending', 'Paid', 'Partial', 'Overdue'))
);

CREATE INDEX idx_repayment_schedule_advance ON advance_repayment_schedule(advance_request_id);
CREATE INDEX idx_repayment_schedule_employee ON advance_repayment_schedule(employee_id);
CREATE INDEX idx_repayment_schedule_due_date ON advance_repayment_schedule(due_date);
CREATE INDEX idx_repayment_schedule_status ON advance_repayment_schedule(status);

-- ============================================================================
-- 3. MODIFY ADVANCE LEDGER TABLE
-- ============================================================================
ALTER TABLE advance_ledger 
ADD COLUMN IF NOT EXISTS advance_request_id INTEGER REFERENCES advance_requests(id),
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS locked_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_advance_ledger_request ON advance_ledger(advance_request_id);
CREATE INDEX IF NOT EXISTS idx_advance_ledger_locked ON advance_ledger(is_locked);

-- ============================================================================
-- 4. CREATE ADVANCE CHANGE REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS advance_change_requests (
    id SERIAL PRIMARY KEY,
    advance_ledger_id INTEGER REFERENCES advance_ledger(id) ON DELETE CASCADE,
    advance_request_id INTEGER REFERENCES advance_requests(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    change_type VARCHAR(50) NOT NULL, -- 'AMOUNT_CORRECTION', 'DATE_CHANGE', 'REPAYMENT_ADJUSTMENT'
    old_value JSONB NOT NULL,
    new_value JSONB NOT NULL,
    reason TEXT NOT NULL,
    requested_by INTEGER NOT NULL REFERENCES users(id),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    CONSTRAINT valid_change_status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);

CREATE INDEX idx_advance_change_requests_status ON advance_change_requests(status);
CREATE INDEX idx_advance_change_requests_employee ON advance_change_requests(employee_id);

-- ============================================================================
-- 5. CREATE ADVANCE AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS advance_audit_log (
    id SERIAL PRIMARY KEY,
    advance_ledger_id INTEGER REFERENCES advance_ledger(id) ON DELETE SET NULL,
    advance_request_id INTEGER REFERENCES advance_requests(id) ON DELETE SET NULL,
    employee_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    notes TEXT,
    CONSTRAINT valid_audit_action CHECK (action IN ('REQUEST', 'APPROVE', 'REJECT', 'DISBURSE', 'REPAY', 'LOCK', 'UNLOCK', 'UPDATE', 'DELETE'))
);

CREATE INDEX idx_advance_audit_employee ON advance_audit_log(employee_id);
CREATE INDEX idx_advance_audit_action ON advance_audit_log(action);
CREATE INDEX idx_advance_audit_changed_at ON advance_audit_log(changed_at DESC);

-- ============================================================================
-- 6. CREATE TRIGGER FOR UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_advance_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_advance_requests_updated_at
    BEFORE UPDATE ON advance_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_advance_requests_updated_at();

-- ============================================================================
-- 7. CREATE VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW employee_advance_summary AS
SELECT 
    e.id as employee_id,
    e.full_name,
    e.employee_code,
    e.position,
    COUNT(DISTINCT ar.id) as total_requests,
    COUNT(DISTINCT CASE WHEN ar.status = 'Approved' THEN ar.id END) as approved_requests,
    SUM(CASE WHEN ar.status IN ('Disbursed', 'Completed') THEN ar.approved_amount ELSE 0 END) as total_disbursed,
    COALESCE(SUM(ars.paid_amount), 0) as total_repaid,
    SUM(CASE WHEN ar.status IN ('Disbursed', 'Completed') THEN ar.approved_amount ELSE 0 END) - 
        COALESCE(SUM(ars.paid_amount), 0) as outstanding_balance,
    MAX(ar.requested_at) as last_request_date
FROM employees e
LEFT JOIN advance_requests ar ON e.id = ar.employee_id
LEFT JOIN advance_repayment_schedule ars ON ar.id = ars.advance_request_id
GROUP BY e.id, e.full_name, e.employee_code, e.position;

-- ============================================================================
-- 8. CREATE FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_monthly_deduction(
    p_amount DECIMAL,
    p_months INTEGER
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ROUND(p_amount / p_months, 2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_overdue_repayments()
RETURNS TABLE (
    employee_id INTEGER,
    employee_name VARCHAR,
    advance_id INTEGER,
    overdue_amount DECIMAL,
    due_date DATE,
    days_overdue INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ars.employee_id,
        e.full_name,
        ars.advance_request_id,
        (ars.scheduled_amount - ars.paid_amount) as overdue_amount,
        ars.due_date,
        (CURRENT_DATE - ars.due_date)::INTEGER as days_overdue
    FROM advance_repayment_schedule ars
    JOIN employees e ON ars.employee_id = e.id
    WHERE ars.status IN ('Pending', 'Partial')
      AND ars.due_date < CURRENT_DATE
    ORDER BY ars.due_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. MIGRATE EXISTING DATA
-- ============================================================================
-- Create advance requests for existing advances
INSERT INTO advance_requests (
    employee_id, 
    requested_amount, 
    approved_amount, 
    reason, 
    status, 
    disbursed_at,
    repayment_months
)
SELECT 
    employee_id,
    amount,
    amount,
    COALESCE(notes, 'Migrated from old system'),
    'Disbursed',
    transaction_date,
    3
FROM advance_ledger
WHERE transaction_type = 'Advance'
ON CONFLICT DO NOTHING;

-- Link existing advances to requests
UPDATE advance_ledger al
SET advance_request_id = ar.id
FROM advance_requests ar
WHERE al.employee_id = ar.employee_id
  AND al.amount = ar.approved_amount
  AND al.transaction_date = ar.disbursed_at
  AND al.transaction_type = 'Advance';

-- Auto-lock advances older than 7 days
UPDATE advance_ledger
SET is_locked = TRUE,
    locked_at = CURRENT_TIMESTAMP
WHERE transaction_date < CURRENT_DATE - INTERVAL '7 days'
  AND is_locked = FALSE;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name LIKE '%advance%';

-- SELECT * FROM employee_advance_summary LIMIT 5;
-- SELECT * FROM get_overdue_repayments();
