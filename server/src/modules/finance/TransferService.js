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

        // Auto-Approve it to complete the transfer immediately
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
        // Create an Advance Request
        const request = await AdvanceService.createRequest({
            employeeId,
            type: 'Advance',
            amount,
            notes: description || `Direct Transfer via ${mode}`,
            paymentMode: mode,
            paidBy: performedByUserId // technically "requested by" but used for tracking
        }, performedByUserId,client);

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

        // Auto-Approve
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
        // Create Repayment Request
        const request = await AdvanceService.createRequest({
            employeeId,
            type: 'Repayment',
            amount,
            notes: description || `Direct Repayment via ${mode}`,
            paymentMode: mode,
            paidBy: performedByUserId
        }, performedByUserId,client);

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
    async executeTransfer(fromCode,toCode,amount,description,performedByUserId) {
        const {finite}=require('../../utils/domain');
        const {assertWritable}=require('./writeGuard');
        amount=finite(amount,'Transfer amount',{positive:true});
        const client=await db.pool.connect();
        try {
            await client.query('BEGIN');await assertWritable(client,new Date(),[fromCode,toCode]);
            await client.query('SELECT code FROM chart_of_accounts WHERE code=ANY($1) ORDER BY code FOR UPDATE',[[fromCode,toCode]]);
            const wallets=(await client.query("SELECT u.id,u.ledger_account_code FROM users u JOIN chart_of_accounts a ON a.code=u.ledger_account_code WHERE u.ledger_account_code=ANY($1) AND a.type='Asset' ORDER BY u.id",[[fromCode,toCode]])).rows;
            const balances=new Map();
            for(const w of wallets) balances.set(w.id,Number((await client.query('SELECT COALESCE(SUM(debit-credit),0) AS balance FROM ledger_lines WHERE account_code=$1',[w.ledger_account_code])).rows[0].balance));
            const je=await JournalService.createJournalEntry({date:new Date(),description,reference_id:performedByUserId,reference_type:'Transfer',lines:[{account_code:toCode,debit:amount},{account_code:fromCode,credit:amount}]},client);
            for(const w of wallets){const direction=Number(w.ledger_account_code)===Number(toCode)?'In':'Out';const before=balances.get(w.id);await client.query('INSERT INTO wallet_transfer_history(user_id,journal_entry_id,direction,amount,balance_before,balance_after,performed_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[w.id,je.id,direction,amount,before,before+(direction==='In'?amount:-amount),performedByUserId]);}
            await client.query('COMMIT');return je;
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }
    async getWalletHistory() {
        const wallets=(await db.query("SELECT u.id,u.full_name,u.employee_id,u.ledger_account_code,COALESCE(SUM(l.debit-l.credit),0) AS balance,GREATEST(0,-COALESCE(SUM(l.debit-l.credit),0)) AS overdraft FROM users u LEFT JOIN ledger_lines l ON l.account_code=u.ledger_account_code WHERE u.ledger_account_code IN (SELECT code FROM chart_of_accounts WHERE type='Asset') GROUP BY u.id ORDER BY u.full_name")).rows;
        const history=(await db.query('SELECT h.*,u.full_name,j.description FROM wallet_transfer_history h JOIN users u ON u.id=h.user_id JOIN journal_entries j ON j.id=h.journal_entry_id ORDER BY h.id DESC LIMIT 500')).rows;
        return {wallets,history};
    }
}
module.exports = new TransferService();
