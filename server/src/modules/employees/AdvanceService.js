const db = require('../../config/db');
const JournalService = require('../finance/JournalService');
const JournalEntry = require('../finance/entities/JournalEntry');
const PaymentModeService = require('../finance/PaymentModeService');

class AdvanceService {
    /**
     * Get All Advances
     */
    async getAllAdvances() {
        const query = `
            SELECT al.*, e.full_name as employee_name, e.employee_code, e.role
            FROM advance_ledger al
            JOIN employees e ON al.employee_id = e.id
            ORDER BY al.transaction_date DESC
        `;
        const result = await db.query(query);
        return result.rows;
    }

    /**
     * Get Employee Balance
     */
    async getEmployeeBalance(employeeId) {
        const result = await db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
             FROM advance_ledger WHERE employee_id = $1`,
            [employeeId]
        );
        return parseFloat(result.rows[0].balance || 0);
    }

    /**
     * Create Advance Request
     */
    async createRequest(data, userId) {
        const { employeeId, type, amount, notes, paymentMode, paidBy } = data;
        const result = await db.query(`
            INSERT INTO advance_requests 
            (employee_id, type, requested_amount, reason, payment_mode, paid_by, requested_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [employeeId, type, parseFloat(amount), notes, paymentMode || 'Cash', paidBy, userId]);
        return result.rows[0];
    }

    /**
     * Get All Requests
     */
    async getRequests() {
        const query = `
            SELECT ar.*, ar.requested_amount as amount, e.full_name as employee_name, e.employee_code, e.role, u.full_name as requester_name
            FROM advance_requests ar
            JOIN employees e ON ar.employee_id = e.id
            LEFT JOIN users u ON ar.requested_by = u.id
            ORDER BY 
                CASE WHEN ar.status = 'Pending' THEN 1 ELSE 2 END,
                ar.requested_at DESC
        `;
        const result = await db.query(query);
        return result.rows;
    }

    /**
     * Approve Request
     */
    async approveRequest(id, userId, client) {
        const reqRes = await client.query('SELECT * FROM advance_requests WHERE id = $1 FOR UPDATE', [id]);
        if (reqRes.rows.length === 0) throw new Error('Request not found');
        const request = reqRes.rows[0];

        if (request.status !== 'Pending') throw new Error('Request already processed');

        const currentBalance = await this.getEmployeeBalance(request.employee_id);

        if (request.type === 'Repayment' && parseFloat(request.requested_amount) > currentBalance) {
            throw new Error(`Repayment amount exceeds outstanding balance (₹${currentBalance})`);
        }

        let newBalance = currentBalance;
        if (request.type === 'Advance') {
            newBalance += parseFloat(request.requested_amount);
        } else {
            newBalance -= parseFloat(request.requested_amount);
        }

        const cashAccount = await PaymentModeService.getAccountCode(request.payment_mode || 'cash');

        // Create Journal Entry (Domain Driven)
        const journal = new JournalEntry({
            date: new Date(),
            description: `Salary ${request.type} - ${request.reason}`,
            reference_id: id,
            reference_type: `Advance${request.type}`,
            lines: request.type === 'Advance' ? [
                { account_code: 1100, debit: parseFloat(request.requested_amount), credit: 0 }, // Dr: Advance Receivable
                { account_code: cashAccount, debit: 0, credit: parseFloat(request.requested_amount) } // Cr: Cash/Bank
            ] : [
                { account_code: cashAccount, debit: parseFloat(request.requested_amount), credit: 0 }, // Dr: Cash/Bank
                { account_code: 1100, debit: 0, credit: parseFloat(request.requested_amount) } // Cr: Advance Receivable
            ]
        });

        const je = await JournalService.createJournalEntry(journal, client);

        const ledgerRes = await client.query(`
            INSERT INTO advance_ledger 
            (employee_id, transaction_type, amount, balance_after, notes, payment_mode, paid_by, advance_request_id, approved_by, approved_at, journal_entry_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
            RETURNING *
        `, [request.employee_id, request.type, request.requested_amount, newBalance, request.reason, request.payment_mode, request.paid_by, id, userId, je.id]);

        await client.query(`
            UPDATE advance_requests SET status = 'Approved', approved_by = $1, approved_at = NOW() WHERE id = $2
        `, [userId, id]);

        return { jeId: je.id, ledgerEntry: ledgerRes.rows[0] };
    }

    /**
     * Reject Request
     */
    async rejectRequest(id, userId, reason) {
        await db.query(`
            UPDATE advance_requests SET status = 'Rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2 WHERE id = $3
        `, [userId, reason, id]);
        return true;
    }
}

module.exports = new AdvanceService();
