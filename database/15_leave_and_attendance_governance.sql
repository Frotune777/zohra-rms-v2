-- Migration: Add Leave Management and Attendance Governance
-- Version: 15
-- Date: 2024-12-15
-- Description: Adds leave requests, audit logging, and attendance governance features

BEGIN;

-- ============================================================================
-- 1. CREATE LEAVE REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(50) NOT NULL, -- 'Sick', 'Casual', 'Paid', 'Unpaid', 'Emergency'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range CHECK (end_date >= start_date),
    CONSTRAINT valid_status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);

-- Indexes for leave_requests
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_created ON leave_requests(created_at DESC);

-- ============================================================================
-- 2. MODIFY ATTENDANCE TABLE
-- ============================================================================
ALTER TABLE attendance 
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS locked_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS leave_request_id INTEGER REFERENCES leave_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5,2) DEFAULT 0;

-- Indexes for new attendance columns
CREATE INDEX IF NOT EXISTS idx_attendance_locked ON attendance(is_locked);
CREATE INDEX IF NOT EXISTS idx_attendance_leave ON attendance(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date_employee ON attendance(date, employee_id);

-- ============================================================================
-- 3. CREATE ATTENDANCE CHANGE REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance_change_requests (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER REFERENCES attendance(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    date DATE NOT NULL,
    old_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    old_overtime_hours DECIMAL(5,2),
    new_overtime_hours DECIMAL(5,2),
    reason TEXT NOT NULL,
    requested_by INTEGER NOT NULL REFERENCES users(id),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    CONSTRAINT valid_change_status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);

-- Indexes for attendance_change_requests
CREATE INDEX idx_change_requests_status ON attendance_change_requests(status);
CREATE INDEX idx_change_requests_date ON attendance_change_requests(date);
CREATE INDEX idx_change_requests_employee ON attendance_change_requests(employee_id);
CREATE INDEX idx_change_requests_requested ON attendance_change_requests(requested_at DESC);

-- ============================================================================
-- 4. CREATE ATTENDANCE AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance_audit_log (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
    employee_id INTEGER NOT NULL,
    date DATE NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOCK', 'UNLOCK', 'BULK_SAVE'
    old_value JSONB,
    new_value JSONB,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT valid_action CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOCK', 'UNLOCK', 'BULK_SAVE', 'APPROVE_CHANGE', 'REJECT_CHANGE'))
);

-- Indexes for attendance_audit_log
CREATE INDEX idx_audit_log_employee ON attendance_audit_log(employee_id);
CREATE INDEX idx_audit_log_date ON attendance_audit_log(date);
CREATE INDEX idx_audit_log_action ON attendance_audit_log(action);
CREATE INDEX idx_audit_log_changed_at ON attendance_audit_log(changed_at DESC);
CREATE INDEX idx_audit_log_attendance ON attendance_audit_log(attendance_id);

-- ============================================================================
-- 5. CREATE TRIGGER FOR UPDATED_AT ON LEAVE_REQUESTS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_leave_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_requests_updated_at
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_leave_requests_updated_at();

-- ============================================================================
-- 6. AUTO-LOCK OLD ATTENDANCE RECORDS (7+ days old)
-- ============================================================================
UPDATE attendance 
SET is_locked = TRUE, 
    locked_at = CURRENT_TIMESTAMP,
    locked_by = (SELECT id FROM users WHERE role = 'owner' LIMIT 1)
WHERE date < CURRENT_DATE - INTERVAL '7 days'
  AND is_locked = FALSE;

-- ============================================================================
-- 7. CREATE VIEW FOR ATTENDANCE WITH LEAVE INFO
-- ============================================================================
CREATE OR REPLACE VIEW attendance_with_leaves AS
SELECT 
    a.*,
    e.full_name,
    e.employee_code,
    e.position,
    e.role,
    lr.leave_type,
    lr.status as leave_status,
    lr.reason as leave_reason,
    CASE 
        WHEN lr.id IS NOT NULL AND lr.status = 'Approved' THEN TRUE
        ELSE FALSE
    END as is_on_approved_leave,
    CASE 
        WHEN lr.id IS NOT NULL AND lr.status = 'Pending' THEN TRUE
        ELSE FALSE
    END as has_pending_leave
FROM attendance a
JOIN employees e ON a.employee_id = e.id
LEFT JOIN leave_requests lr ON a.leave_request_id = lr.id;

-- ============================================================================
-- 8. CREATE FUNCTION TO GET ATTENDANCE CALENDAR STATUS
-- ============================================================================
CREATE OR REPLACE FUNCTION get_attendance_calendar(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    date DATE,
    total_employees INTEGER,
    filled_records INTEGER,
    is_locked BOOLEAN,
    last_updated TIMESTAMP,
    status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.date,
        COUNT(DISTINCT e.id)::INTEGER as total_employees,
        COUNT(DISTINCT a.employee_id)::INTEGER as filled_records,
        BOOL_OR(a.is_locked) as is_locked,
        MAX(COALESCE(a.updated_at, a.created_at)) as last_updated,
        CASE 
            WHEN BOOL_OR(a.is_locked) THEN 'locked'::VARCHAR(20)
            WHEN COUNT(DISTINCT a.employee_id) = COUNT(DISTINCT e.id) THEN 'complete'::VARCHAR(20)
            WHEN COUNT(DISTINCT a.employee_id) > 0 THEN 'partial'::VARCHAR(20)
            ELSE 'missing'::VARCHAR(20)
        END as status
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS date_series(date)
    CROSS JOIN (SELECT id FROM employees WHERE status = 'active') e
    LEFT JOIN attendance a ON a.date = date_series.date::DATE AND a.employee_id = e.id
    GROUP BY a.date
    ORDER BY a.date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. INSERT SAMPLE LEAVE TYPES (OPTIONAL - FOR REFERENCE)
-- ============================================================================
-- This is just documentation. Leave types are stored as VARCHAR in leave_requests.leave_type
-- Valid types: 'Sick', 'Casual', 'Paid', 'Unpaid', 'Emergency'

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================
-- Grant permissions to application user (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON leave_requests TO your_app_user;
-- GRANT SELECT, INSERT ON attendance_audit_log TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON attendance_change_requests TO your_app_user;
-- GRANT SELECT ON attendance_with_leaves TO your_app_user;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the migration was successful:

-- Check if tables exist
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('leave_requests', 'attendance_change_requests', 'attendance_audit_log');

-- Check attendance table columns
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'attendance' 
-- AND column_name IN ('is_locked', 'leave_request_id', 'notes', 'overtime_hours');

-- Check indexes
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('leave_requests', 'attendance', 'attendance_change_requests', 'attendance_audit_log');

-- Test the calendar function
-- SELECT * FROM get_attendance_calendar(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE);
