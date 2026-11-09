const db = require('../../config/db');
const JournalService = require('./JournalService');
const PaymentModeService = require('./PaymentModeService');
const { assertWritable } = require('./writeGuard');
const { DomainError, finite } = require('../../utils/domain');
const { isDeepStrictEqual } = require('node:util');
const fields = ['date','type','amount','payment_method','status','description','category_id','metadata','paid_by','paid_date','vendor_id','mode'];
function sameField(key, left, right) {
    if (left == null || right == null) return left === right;
    if (key === 'amount') return Math.round((Number(left)+Number.EPSILON)*100) === Math.round((Number(right)+Number.EPSILON)*100);
    if (key === 'category_id' || key === 'vendor_id') return Number(left) === Number(right);
    if (key === 'date' || key === 'paid_date') {
        const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
        return day(left) === day(right);
    }
    return isDeepStrictEqual(left, right);
}
class TransactionService {
    async atomic(work, suppliedClient = null) {
        if (suppliedClient) return work(suppliedClient);
        const client = await db.pool.connect();
        try { await client.query('BEGIN'); const result=await work(client); await client.query('COMMIT'); return result; }
        catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    }
    validate(t) {
        finite(t.amount,'Amount',{positive:true});
        if (!['Sales','Expense'].includes(t.type) || !['Pending','Paid'].includes(t.status)) throw new DomainError('Invalid transaction type or status');
    }
    async account(t, client) {
        if (t.mode === 'Bank_Cash') return 1030;
        return PaymentModeService.getAccountCode(t.mode === 'Bank' ? 'Bank' : (t.payment_method || t.mode || 'Cash'), client);
    }
    async post(t, client) {
        this.validate(t);
        const amount=Number(t.amount), account=await this.account(t,client);
        let payable=2000, expense=6000;
        if(t.category_id) {
            const category=(await client.query('SELECT account_code,type FROM transaction_categories WHERE id=$1',[t.category_id])).rows[0];
            if(!category || category.type !== t.type.replace('Sales','Revenue') && t.type === 'Expense') throw new DomainError('Invalid expense category');
            expense=category.account_code || expense;
        }
        if(t.vendor_id && t.type === 'Expense') {
            const vendor=(await client.query('SELECT ledger_account_code FROM suppliers WHERE id=$1 FOR UPDATE',[t.vendor_id])).rows[0];
            if(!vendor) throw new DomainError('Vendor not found',404);
            payable=vendor.ledger_account_code || 2000;
            await client.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount,details,reference_number) VALUES($1,$2,'Bill',$3,$4,$5)",[t.vendor_id,t.date,amount,t.description,'TRX-'+t.id]);
        }
        const transfer=t.mode === 'Bank_Cash' && t.type === 'Sales';
        const lines=transfer ? [{account_code:1030,debit:amount},{account_code:1000,credit:amount}]
          : t.type === 'Sales' ? [{account_code:account,debit:amount},{account_code:4000,credit:amount}]
          : [{account_code:expense,debit:amount},{account_code:t.vendor_id ? payable : account,credit:amount}];
        await JournalService.createJournalEntry({date:t.date,description:'Tracker: '+t.description,reference_type:'Tracker',reference_id:t.id,lines},client);
        if(t.vendor_id && t.type === 'Expense' && t.status === 'Paid') {
            const payment=(await client.query("INSERT INTO vendor_payments(vendor_id,amount,payment_mode,reference_number,notes,paid_by,payment_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[t.vendor_id,amount,t.payment_method || 'Cash','TRX-'+t.id,t.description || 'Tracker settlement',t.paid_by || 'Unknown',t.paid_date || t.date])).rows[0];
            await client.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount,details,reference_number,payment_id) VALUES($1,$2,'Payment',$3,$4,$5,$6)",[t.vendor_id,t.paid_date || t.date,amount,t.description,'TRX-'+t.id,payment.id]);
            const je=await JournalService.createJournalEntry({date:t.paid_date || t.date,description:'Tracker settlement '+t.id,reference_type:'TrackerSettlement',reference_id:t.id,lines:[{account_code:payable,debit:amount},{account_code:account,credit:amount}]},client);
            await client.query('UPDATE vendor_payments SET journal_entry_id=$1 WHERE id=$2',[je.id,payment.id]);
        }
    }
    async undo(t, client) {
        const journals=await client.query("SELECT j.id,j.transaction_date FROM journal_entries j WHERE reference_id=$1 AND reference_type IN ('Tracker','TrackerSettlement') AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reference_type='Reversal' AND r.reference_id=j.id::text)",[String(t.id)]);
        for(const j of journals.rows) await JournalService.reverseJournalEntry(j.id,'Tracker corrected or deleted',j.transaction_date,client);
        const ledgers=await client.query('SELECT supplier_id,transaction_type,SUM(amount) AS amount FROM vendor_ledger WHERE reference_number=$1 GROUP BY supplier_id,transaction_type',['TRX-'+t.id]);
        for(const l of ledgers.rows) if(Number(l.amount)) await client.query('INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount,details,reference_number) VALUES($1,$2,$3,$4,$5,$6)',[l.supplier_id,t.date,l.transaction_type,-Number(l.amount),'Tracker reversal','TRX-'+t.id]);
        await client.query("UPDATE vendor_payments SET status='Reversed' WHERE reference_number=$1 AND status='Posted'",['TRX-'+t.id]);
    }
    async createTransaction(data) {
        return this.atomic(async client => {
            const t={...data,status:data.status || 'Pending',metadata:data.metadata || {}};
            this.validate(t);
            await assertWritable(client,t.date,[await this.account(t,client)]);
            const inserted=(await client.query('INSERT INTO transactions ('+fields.join(',')+') VALUES ('+fields.map((f,i)=>'$'+(i+1)).join(',')+') RETURNING *',fields.map(f=>t[f] ?? null))).rows[0];
            await this.post(inserted,client);return inserted;
        });
    }
    async getTransactions(filters = {}) {
        let query = `
            SELECT t.*, s.name as vendor_name, c.name as category_name
            FROM transactions t
            LEFT JOIN suppliers s ON t.vendor_id = s.id
            LEFT JOIN transaction_categories c ON t.category_id = c.id
            WHERE 1=1
        `;
        const values = [];
        let paramCount = 1;

        if (filters.date) {
            query += ` AND t.date = $${paramCount}`;
            values.push(filters.date);
            paramCount++;
        }

        if (filters.startDate && filters.endDate) {
            query += ` AND t.date BETWEEN $${paramCount} AND $${paramCount + 1}`;
            values.push(filters.startDate, filters.endDate);
            paramCount += 2;
        }

        if (filters.type) {
            query += ` AND t.type = $${paramCount}`;
            values.push(filters.type);
            paramCount++;
        }

        query += ` ORDER BY t.created_at DESC`;

        const result = await db.query(query, values);
        return result.rows;
    }


    async updateTransaction(id, updates, suppliedClient = null) {
        return this.atomic(async client => {
            const candidate=(await client.query('SELECT * FROM transactions WHERE id=$1',[id])).rows[0];
            if(!candidate) throw new DomainError('Transaction not found',404);
            const day=await assertWritable(client,candidate.date,[await this.account(candidate,client)]);
            const current=(await client.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE',[id])).rows[0];
            if(!current) throw new DomainError('Transaction not found',404);
            if(new Date(current.date).toISOString().slice(0,10)!==day) throw new DomainError('Transaction date changed; retry',409);
            const patch=Object.fromEntries(Object.entries(updates).filter(([key])=>fields.includes(key)));
            const t={...current,...patch};this.validate(t);
            await assertWritable(client,t.date,[await this.account(t,client)]);
            const keys=Object.keys(patch);
            if(!keys.length || keys.every(key=>sameField(key,t[key],current[key]))) return current;
            await this.undo(current,client);
            const updated=(await client.query('UPDATE transactions SET '+keys.map((k,i)=>k+'=$'+(i+2)).join(',')+',updated_at=NOW() WHERE id=$1 RETURNING *',[id,...keys.map(k=>t[k])])).rows[0];
            await this.post(updated,client);return updated;
        }, suppliedClient);
    }
    async deleteTransaction(id) {
        return this.atomic(async client => {
            const candidate=(await client.query('SELECT * FROM transactions WHERE id=$1',[id])).rows[0];
            if(!candidate) return null;
            const day=await assertWritable(client,candidate.date,[await this.account(candidate,client)]);
            const t=(await client.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE',[id])).rows[0];
            if(!t) return null;
            if(new Date(t.date).toISOString().slice(0,10)!==day) throw new DomainError('Transaction date changed; retry',409);
            await this.undo(t,client);
            return (await client.query('DELETE FROM transactions WHERE id=$1 RETURNING id',[id])).rows[0];
        });
    }
    /**
     * Get total sum by type for a date
     */
    async getSumByType(date, type) {
        const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE date = $1 AND type = $2
    `;
        const result = await db.query(query, [date, type]);
        return parseFloat(result.rows[0].total);
    }

    /**
     * Get total sales by payment method for a date
     */
    async getSalesByMethod(date, method) {
        const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE date = $1 AND type = 'Sales' AND payment_method = $2
    `;
        const result = await db.query(query, [date, method]);
        return parseFloat(result.rows[0].total);
    }

    /**
     * Get total expenses by payment method for a date
     */
    async getExpensesByMethod(date, method) {
        const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE date = $1 AND type = 'Expense' AND payment_method = $2
    `;
        const result = await db.query(query, [date, method]);
        return parseFloat(result.rows[0].total);
    }

    async getPendingPayments(date) {
        const query = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE date = $1 AND status = 'Pending'
      `;
        const result = await db.query(query, [date]);
        return parseFloat(result.rows[0].total);
    }

    /**
     * Get transaction categories
     */
    async getCategories() {
        const query = 'SELECT * FROM transaction_categories ORDER BY type, name';
        const result = await db.query(query);
        return result.rows;
    }
}
module.exports=new TransactionService();
