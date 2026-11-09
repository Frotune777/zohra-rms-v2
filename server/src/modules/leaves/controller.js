const db = require('../../config/db');
const { DomainError, statusFor } = require('../../utils/domain');

/**
 * Get leave requests with optional filters
 */
exports.getLeaveRequests = async (req, res) => {
    const { status, startDate, endDate } = req.query;
    const employeeId = req.user.role === 'staff' ? req.user.employee_id : req.query.employeeId;
    if(req.user.role === 'staff' && !employeeId) return res.status(403).json({error:'Linked employee required'});
    try {
        let query = `
            SELECT lr.*, 
                   e.full_name, 
                   e.employee_code, 
                   e.position,
                   u.full_name as approved_by_name
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            LEFT JOIN users u ON lr.approved_by = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (status) {
            query += ` AND lr.status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }
        if (startDate) {
            query += ` AND lr.end_date >= $${paramCount}`;
            params.push(startDate);
            paramCount++;
        }
        if (endDate) {
            query += ` AND lr.start_date <= $${paramCount}`;
            params.push(endDate);
            paramCount++;
        }
        if (employeeId) {
            query += ` AND lr.employee_id = $${paramCount}`;
            params.push(employeeId);
            paramCount++;
        }

        query += ' ORDER BY lr.created_at DESC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

/**
 * Get leave requests for a specific employee
 */
exports.getEmployeeLeaves = async (req, res) => {
    const { id } = req.params;
    if(req.user.role === 'staff' && Number(id) !== req.user.employee_id) return res.status(403).json({error:'Employee access denied'});
    try {
        const result = await db.query(`
            SELECT lr.*, u.full_name as approved_by_name
            FROM leave_requests lr
            LEFT JOIN users u ON lr.approved_by = u.id
            WHERE lr.employee_id = $1
            ORDER BY lr.created_at DESC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

/**
 * Get leaves for a specific date (for attendance integration)
 */
exports.getLeavesByDate = async (req, res) => {
    const { date } = req.params;
    if(req.user.role === 'staff' && !req.user.employee_id) return res.status(403).json({error:'Linked employee required'});
    try {
        const result = await db.query(`
            SELECT lr.*, e.full_name, e.employee_code, e.position
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            WHERE lr.start_date <= $1 
              AND lr.end_date >= $1
              AND lr.status IN ('Approved', 'Pending')
              AND ($2::int IS NULL OR lr.employee_id=$2)
            ORDER BY e.full_name
        `, [date, req.user.role === 'staff' ? req.user.employee_id : null]);
        res.json(result.rows);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

/**
 * Create a new leave request
 */
exports.createLeaveRequest = async (req, res) => {
    const { employee_id, leave_type, start_date, end_date, reason } = req.body;

    if(req.user.role === 'staff' && Number(employee_id) !== req.user.employee_id) return res.status(403).json({error:'Employee access denied'});
    // Validation
    if (!employee_id || !leave_type || !start_date || !end_date) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        if (!['Sick', 'Casual', 'Paid', 'Unpaid', 'Emergency'].includes(leave_type)) {
            throw new DomainError('Invalid leave type');
        }
        const result = await db.query(`
            INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [employee_id, leave_type, start_date, end_date, reason]);

        // Fetch the complete leave request with employee data
        const leaveWithEmployee = await db.query(`
            SELECT lr.*, 
                   e.full_name, 
                   e.employee_code, 
                   e.position
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            WHERE lr.id = $1
        `, [result.rows[0].id]);

        res.json(leaveWithEmployee.rows[0]);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

/**
 * Approve a leave request and auto-create attendance records
 */
exports.approveLeave = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Update leave request
        const result = await client.query(`
            UPDATE leave_requests 
            SET status = 'Approved', 
                approved_by = $1, 
                approved_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND status = 'Pending'
            RETURNING *
        `, [userId, id]);

        if (result.rows.length === 0) {
            throw new DomainError('Leave request not found or already processed',409);
        }

        const leave = result.rows[0];

        await client.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE',[leave.employee_id]);
        const locked=await client.query('SELECT id FROM attendance WHERE employee_id=$1 AND date BETWEEN $2 AND $3 AND (is_locked=TRUE OR leave_request_id IS NOT NULL)',[leave.employee_id,leave.start_date,leave.end_date]);
        if(locked.rowCount) throw new DomainError('Leave overlaps locked attendance',409);
        // Auto-create attendance records for approved leave
        const dates = [];
        const currentDate = new Date(leave.start_date);
        const endDate = new Date(leave.end_date);

        while (currentDate <= endDate) {
            dates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (const date of dates) {
            await client.query(`
                INSERT INTO attendance (employee_id, date, status, leave_request_id, notes)
                VALUES ($1, $2, 'Absent', $3, $4)
                ON CONFLICT (employee_id, date) 
                DO UPDATE SET 
                    status = 'Absent',
                    leave_request_id = $3,
                    notes = $4
            `, [leave.employee_id, date, leave.id, `Approved Leave: ${leave.leave_type}`]);

            // Log audit trail
            await client.query(`
                INSERT INTO attendance_audit_log 
                (employee_id, date, action, new_value, changed_by)
                VALUES ($1, $2, 'CREATE', $3, $4)
            `, [leave.employee_id, date, JSON.stringify({ status: 'Absent', leave_type: leave.leave_type }), userId]);
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(statusFor(err)).json({ error: err.message });
    } finally {
        client.release();
    }
};

/**
 * Reject a leave request
 */
exports.rejectLeave = async (req, res) => {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.user.id;

    try {
        const result = await db.query(`
            UPDATE leave_requests 
            SET status = 'Rejected', 
                approved_by = $1, 
                approved_at = CURRENT_TIMESTAMP,
                rejection_reason = $2
            WHERE id = $3 AND status = 'Pending'
            RETURNING *
        `, [userId, rejection_reason, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Leave request not found or already processed' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

/**
 * Delete a leave request (only if pending)
 */
exports.deleteLeaveRequest = async (req, res) => {
    const { id } = req.params;

    try {
        if(req.user.role === 'staff') {
            const leave=(await db.query('SELECT employee_id FROM leave_requests WHERE id=$1',[id])).rows[0];
            if(!leave || leave.employee_id !== req.user.employee_id) return res.status(403).json({error:'Employee access denied'});
        }
        const result = await db.query(`
            DELETE FROM leave_requests 
            WHERE id = $1 AND status = 'Pending'
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Leave request not found or cannot be deleted' });
        }

        res.json({ success: true, message: 'Leave request deleted' });
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};
