const db = require('../../config/db');
const JournalService = require('./JournalService');

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
     * Transfer from Main Safe (1000) to User
     */
    async transferSafeToUser(toUserId, amount, description, performedByUserId) {
        const toCode = await this.getLedgerCodeForUser(toUserId);
        // From Main Safe (1000)
        return await this.executeTransfer(1000, toCode, amount, description || 'Transfer from Main Safe', performedByUserId);
    }

    /**
     * Transfer from User to Main Safe (1000)
     */
    async transferUserToSafe(fromUserId, amount, description, performedByUserId) {
        const fromCode = await this.getLedgerCodeForUser(fromUserId);
        // To Main Safe (1000)
        return await this.executeTransfer(fromCode, 1000, amount, description || 'Return to Main Safe', performedByUserId);
    }

    /**
     * Core Transfer Execution
     */
    async executeTransfer(fromCode, toCode, amount, description, performedByUserId) {
        if (amount <= 0) throw new Error("Amount must be positive");

        // Create Journal Entry structure
        // Note: JournalService expects an object that constructor of JournalEntry accepts
        const entry = {
            date: new Date(),
            description: description,
            reference_id: performedByUserId, // Tracking who initiated
            reference_type: 'Transfer',
            lines: [
                { account_code: toCode, debit: amount, credit: 0 },   // Receiver (Asset Increase = Dr)
                { account_code: fromCode, debit: 0, credit: amount }  // Sender (Asset Decrease = Cr)
            ]
        };

        return await JournalService.createJournalEntry(entry);
    }
}

module.exports = new TransferService();
