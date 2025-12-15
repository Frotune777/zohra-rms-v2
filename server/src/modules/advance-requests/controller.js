const db = require('../../config/db');

exports.getAdvanceRequests = async (req, res) => {
    const { status, employeeId } = req.query;
    try {
        let query = `
            SELECT ar.*, e.full_name, e.employee_code, e.position,
                   u.full_name as requested_by_name,
                   u2.full_name as approved_by_name
            FROM advance_requests ar
            JOIN employees e ON ar.employee_id = e.id
            LEFT JOIN users u ON ar.requested_by = u.id
            LEFT JOIN users u2 ON ar.approved_by = u2.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (status) {
            query += ` AND ar.status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }
        if (employeeId) {
            query += ` AND ar.employee_id = $${paramCount}`;
            params.push(employeeId);
            paramCount++;
        }

        query += ' ORDER BY ar.requested_at DESC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createAdvanceRequest = async (req, res) => {
    const { employee_id, requested_amount, reason, urgency, repayment_months } = req.body;
    const userId = req.user.id;

    if (!employee_id || !requested_amount || !reason) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const monthly_deduction = (requested_amount / (repayment_months || 3)).toFixed(2);

        const result = await db.query(`
            INSERT INTO advance_requests 
            (employee_id, requested_amount, reason, urgency, repayment_months, monthly_deduction, requested_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [employee_id, requested_amount, reason, urgency || 'Normal', repayment_months || 3, monthly_deduction, userId]);

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.approveAdvanceRequest = async (req, res) => {
    const { id } = req.params;
    const { approved_amount, repayment_months } = req.body;
    const userId = req.user.id;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(`
            UPDATE advance_requests
            SET status = 'Approved',
                approved_amount = $1,
                repayment_months = $2,
                monthly_deduction = $3,
                approved_by = $4,
                approved_at = CURRENT_TIMESTAMP
            WHERE id = $5 AND status = 'Pending'
            RETURNING *
        `, [approved_amount, repayment_months, (approved_amount / repayment_months).toFixed(2), userId, id]);

        if (result.rows.length === 0) {
            throw new Error('Request not found or already processed');
        }

        const request = result.rows[0];

        // Generate repayment schedule
        for (let i = 1; i <= repayment_months; i++) {
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + i);

            await client.query(`
                INSERT INTO advance_repayment_schedule
                (advance_request_id, employee_id, month_number, due_date, scheduled_amount)
                VALUES ($1, $2, $3, $4, $5)
            `, [id, request.employee_id, i, dueDate.toISOString().split('T')[0], request.monthly_deduction]);
        }

        // Audit log
        await client.query(`
            INSERT INTO advance_audit_log
            (advance_request_id, employee_id, action, new_value, changed_by)
            VALUES ($1, $2, 'APPROVE', $3, $4)
        `, [id, request.employee_id, JSON.stringify({ approved_amount, repayment_months }), userId]);

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.rejectAdvanceRequest = async (req, res) => {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.user.id;

    try {
        const result = await db.query(`
            UPDATE advance_requests
            SET status = 'Rejected',
                approved_by = $1,
                approved_at = CURRENT_TIMESTAMP,
                rejection_reason = $2
            WHERE id = $3 AND status = 'Pending'
            RETURNING *
        `, [userId, rejection_reason, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Request not found or already processed' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getRepaymentSchedule = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT * FROM advance_repayment_schedule
            WHERE advance_request_id = $1
            ORDER BY month_number
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
