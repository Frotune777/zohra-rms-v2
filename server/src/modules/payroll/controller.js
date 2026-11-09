const db = require('../../config/db');
const { DomainError, finite, statusFor } = require('../../utils/domain');
const lifecycle = require('./lifecycle');

const {buildDrafts}=require('./drafts');
exports.runPayroll=async(req,res)=>{
 const client=await db.pool.connect();
 try {await client.query('BEGIN');const data=await buildDrafts(req.body,client);await client.query('COMMIT');res.json({success:true,data});}
 catch(err){await client.query('ROLLBACK');res.status(statusFor(err)).json({error:err.message});} finally{client.release();}
};

// Get Monthly Payroll
exports.getMonthlyPayroll = async (req, res) => {
    const { month, year } = req.query;
    try {
        const result = await db.query(
            `SELECT sh.*, e.full_name, e.position, e.base_salary,e.bank_account_no,e.ifsc_code,
             (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                     COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0)
              FROM advance_ledger 
              WHERE employee_id = e.id) as total_outstanding_advances
             FROM salary_history sh
             JOIN employees e ON sh.employee_id = e.id
             WHERE sh.month = $1 AND sh.year = $2
             ORDER BY e.full_name`,
            [month, year]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

// Approve Payroll (Lock it)
exports.approvePayroll = async (req, res) => {
    const { id } = req.body; // salary_history id
    try {
        const result = await db.query(
            `UPDATE salary_history SET status = 'Approved' WHERE id = $1 AND status = 'Pending' RETURNING *`,
            [id]
        );
        if(!result.rowCount) throw new DomainError('Payroll is not Pending',409);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(statusFor(err)).json({ error: err.message });
    }
};

// Source, recovery allocations and journals commit together.
exports.markPaid = async (req,res) => {
    const client=await db.pool.connect();
    try {
        await client.query('BEGIN');
        const result=await lifecycle.pay(client,req.body.id,req.body,req.user);
        await client.query('COMMIT');res.json(result);
    } catch(err) {await client.query('ROLLBACK');res.status(statusFor(err)).json({error:err.message});}
    finally {client.release();}
};

// Delete Payroll (Owner Only)
exports.deletePayroll = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        if(!reason?.trim()) throw new DomainError('Reason is required');

        const payroll = await lifecycle.lockForCorrection(client,id);

        if(payroll.status === 'Paid') await lifecycle.reversePaid(client,payroll,reason);

        // 3. Delete components
        await client.query(
            'DELETE FROM salary_history_components WHERE salary_history_id = $1',
            [id]
        );

        // 4. Delete salary history
        await client.query('DELETE FROM salary_history WHERE id = $1', [id]);

        // 5. Create audit log
        await client.query(`
            INSERT INTO payroll_audit_log 
            (salary_history_id, employee_id, action, previous_status, performed_by, reason, metadata)
            VALUES ($1, $2, 'delete', $3, $4, $5, $6)
        `, [
            id,
            payroll.employee_id,
            payroll.status,
            req.user.id,
            reason,
            JSON.stringify(payroll)
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Payroll record deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(statusFor(err)).json({ error: err.message });
    } finally {
        client.release();
    }
};

// Revert Payroll (Owner Only)
exports.revertPayroll = async (req, res) => {
    const { id } = req.params;
    const { targetStatus, reason } = req.body; // 'Pending' or 'Approved'
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        if(!reason?.trim()) throw new DomainError('Reason is required');

        const payroll = await lifecycle.lockForCorrection(client,id);

        // 2. Validate and perform transition
        if (payroll.status === 'Paid' && targetStatus === 'Approved') {
            await lifecycle.reversePaid(client,payroll,reason);

            // Clear payment details and change status
            await client.query(`
                UPDATE salary_history 
                SET status = 'Approved', 
                    payment_mode = NULL, 
                    payment_date = NULL, 
                    paid_by = NULL, paid_by_user_id = NULL
                WHERE id = $1
            `, [id]);

        } else if (payroll.status === 'Approved' && targetStatus === 'Pending') {
            // Simple status change
            await client.query(
                'UPDATE salary_history SET status = $1 WHERE id = $2',
                ['Pending', id]
            );
        } else {
            throw new Error(`Invalid status transition from ${payroll.status} to ${targetStatus}`);
        }

        // 3. Create audit log
        await client.query(`
            INSERT INTO payroll_audit_log 
            (salary_history_id, employee_id, action, previous_status, new_status, performed_by, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            id,
            payroll.employee_id,
            `revert_to_${targetStatus.toLowerCase()}`,
            payroll.status,
            targetStatus,
            req.user.id,
            reason
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: `Payroll reverted to ${targetStatus}` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(statusFor(err)).json({ error: err.message });
    } finally {
        client.release();
    }
};
