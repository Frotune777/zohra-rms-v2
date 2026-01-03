const db = require('../../config/db');
const JournalService = require('./JournalService');
const PaymentModeService = require('./PaymentModeService');
const AdvanceService = require('../employees/AdvanceService');

class TransferService {

    /**
     * Resolve Ledger Code for a User
     */
    async getLedgerCodeForUser(userId) {
        const res = await db.query('SELECT ledger_account_code FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0 || !res.rows[0].ledger_account_code) {
            throw new Error(`User ID ${userId} does not have a linked wallet.`);
        }
        return res.rows[0].ledger_account_code;
    }

    /**
     * Transfer from Safe/Bank (Source) to User (Wallet)
     * @param {Number} toUserId 
     * @param {Number} amount 
     * @param {String} description 
     * @param {Number} performedByUserId 
     * @param {String} mode - 'Cash', 'Bank Transfer', etc.
     */
    async transferSafeToUser(toUserId, amount, description, performedByUserId, mode = 'Cash') {
        const toCode = await this.getLedgerCodeForUser(toUserId);

        // Resolve Source Account based on Mode (e.g., Cash=1000, Bank=1020)
        const sourceAccount = await PaymentModeService.getAccountCode(mode);

        return await this.executeTransfer(sourceAccount, toCode, amount, description || `Transfer via ${mode}`, performedByUserId);
    }

    /**
     * Transfer from Safe/Bank to Employee (treated as Advance)
     * @param {Number} employeeId 
     * @param {Number} amount 
     * @param {String} description 
     * @param {Number} performedByUserId 
     * @param {String} mode 
     */
    async transferSafeToEmployee(employeeId, amount, description, performedByUserId, mode = 'Cash') {
        // Create an Advance Request
        const request = await AdvanceService.createRequest({
            employeeId,
            type: 'Advance',
            amount,
            notes: description || `Direct Transfer via ${mode}`,
            paymentMode: mode,
            paidBy: performedByUserId // technically "requested by" but used for tracking
        }, performedByUserId);

        // Auto-Approve it to complete the transfer immediately
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await AdvanceService.approveRequest(request.id, performedByUserId, client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Transfer from User (Wallet) to Safe/Bank
     * @param {Number} fromUserId 
     * @param {Number} amount 
     * @param {String} description 
     * @param {Number} performedByUserId 
     * @param {String} mode 
     */
    async transferUserToSafe(fromUserId, amount, description, performedByUserId, mode = 'Cash') {
        const fromCode = await this.getLedgerCodeForUser(fromUserId);

        // Resolve Destination Account based on Mode
        const destAccount = await PaymentModeService.getAccountCode(mode);

        return await this.executeTransfer(fromCode, destAccount, amount, description || `Return via ${mode}`, performedByUserId);
    }

    /**
     * Transfer from Employee to Safe/Bank (Repayment)
     */
    async transferEmployeeToSafe(employeeId, amount, description, performedByUserId, mode = 'Cash') {
        // Create Repayment Request
        const request = await AdvanceService.createRequest({
            employeeId,
            type: 'Repayment',
            amount,
            notes: description || `Direct Repayment via ${mode}`,
            paymentMode: mode,
            paidBy: performedByUserId
        }, performedByUserId);

        // Auto-Approve
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await AdvanceService.approveRequest(request.id, performedByUserId, client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Core Transfer Execution (Generic Journal Entry)
     */
    async executeTransfer(fromCode, toCode, amount, description, performedByUserId) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const entry = {
            date: new Date(),
            description: description,
            reference_id: performedByUserId,
            reference_type: 'Transfer',
            lines: [
                { account_code: toCode, debit: amount, credit: 0 },   // Receiver (Dr)
                { account_code: fromCode, debit: 0, credit: amount }  // Sender (Cr)
            ]
        };

        return await JournalService.createJournalEntry(entry);
    }
}

module.exports = new TransferService();
