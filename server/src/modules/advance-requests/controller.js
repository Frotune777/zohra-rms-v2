const db = require('../../config/db');
const { DomainError, finite, statusFor } = require('../../utils/domain');

exports.getAdvanceRequests = async (req, res) => {
    const { status } = req.query;
    const employeeId=req.user.role==='staff'?req.user.employee_id:req.query.employeeId;
    if(req.user.role==='staff'&&!employeeId)return res.status(403).json({error:'Linked employee required'});
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
        res.status(statusFor(err)).json({ error: err.message });
    }
};

exports.createAdvanceRequest = async (req, res) => {
    const { employee_id, requested_amount, reason, urgency, repayment_months } = req.body;
    const userId = req.user.id;
    if(req.user.role==='staff'&&Number(employee_id)!==req.user.employee_id)return res.status(403).json({error:'Employee access denied'});

    if (!employee_id || !requested_amount || !reason) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        finite(requested_amount,'Requested amount',{positive:true});
        if(!Number.isInteger(finite(repayment_months ?? 3,'Repayment months',{positive:true}))) throw new DomainError('Repayment months must be a positive integer');
        const monthly_deduction = (requested_amount / (repayment_months || 3)).toFixed(2);

        const result = await db.query(`
            INSERT INTO advance_requests 
            (employee_id, requested_amount, reason, urgency, repayment_months, monthly_deduction, requested_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [employee_id, requested_amount, reason, urgency || 'Normal', repayment_months || 3, monthly_deduction, userId]);

        res.json(result.rows[0]);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

exports.approveAdvanceRequest = async (req, res) => {
    const { id } = req.params;
    const { approved_amount, repayment_months } = req.body;
    const userId = req.user.id;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        finite(approved_amount,'Approved amount',{positive:true});
        if(!Number.isInteger(finite(repayment_months,'Repayment months',{positive:true}))) throw new DomainError('Repayment months must be a positive integer');

        const paid=await require('../employees/AdvanceService').approveRequest(id,userId,client,{approved_amount,repayment_months,payment_mode:req.body.payment_mode || 'Cash',schedule:true});
        const result=await client.query('UPDATE advance_requests SET repayment_months=$2,monthly_deduction=$3 WHERE id=$1 RETURNING *',[id,repayment_months,(approved_amount/repayment_months).toFixed(2)]);
        const request=result.rows[0];

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
        res.status(statusFor(err)).json({ error: err.message });
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
        res.status(statusFor(err)).json({ error: err.message });
    }
};

exports.getRepaymentSchedule = async (req, res) => {
    const { id } = req.params;
    try {
        if(req.user.role==='staff'){const request=(await db.query('SELECT employee_id FROM advance_requests WHERE id=$1',[id])).rows[0];if(!request||request.employee_id!==req.user.employee_id)return res.status(403).json({error:'Employee access denied'});}
        const result = await db.query(`
            SELECT * FROM advance_repayment_schedule
            WHERE advance_request_id = $1
            ORDER BY month_number
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};
