CREATE TABLE IF NOT EXISTS advance_requests (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id),
    type VARCHAR(20) CHECK (type IN ('Advance', 'Repayment')),
    requested_amount DECIMAL(10,2) NOT NULL,
    reason TEXT,
    payment_mode VARCHAR(50),
    paid_by VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Rejected
    requested_by INT REFERENCES users(id),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INT REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT
);

-- Index for efficient querying by status and employee
CREATE INDEX IF NOT EXISTS idx_advance_requests_status ON advance_requests(status);
CREATE INDEX IF NOT EXISTS idx_advance_requests_employee ON advance_requests(employee_id);
