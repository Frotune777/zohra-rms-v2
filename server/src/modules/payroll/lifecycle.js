const JournalService = require('../finance/JournalService');
const PaymentModeService = require('../finance/PaymentModeService');
const AdvanceService = require('../employees/AdvanceService');
const { DomainError, finite } = require('../../utils/domain');
const { assertWritable } = require('../finance/writeGuard');

async function pay(client, id, data, actor) {
    const date = data.payment_date || new Date();
    const account = await PaymentModeService.getAccountCode(data.payment_mode || 'Cash',client);
    await assertWritable(client,date,[account]);
    const candidate=(await client.query('SELECT employee_id FROM salary_history WHERE id=$1',[id])).rows[0];
    if(!candidate) throw new DomainError('Payroll record not found',404);
    await client.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE',[candidate.employee_id]);
    const record=(await client.query('SELECT * FROM salary_history WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!record) throw new DomainError('Payroll record not found',404);
    if(record.status !== 'Approved') throw new DomainError('Payroll must be Approved before payout',409);
    const deduction=finite(record.advance_deduction || 0,'Advance deduction');
    const net=finite(record.net_pay,'Net pay',{min:-Infinity});
    let repaymentJeId=null;
    if(deduction > 0) {
        const balance=await AdvanceService.getEmployeeBalance(record.employee_id,client);
        if(deduction > balance) throw new DomainError('Advance recovery exceeds outstanding balance',409);
        const advances=await client.query('SELECT * FROM salary_advances WHERE employee_id=$1 AND balance_remaining > 0 ORDER BY created_at,id FOR UPDATE',[record.employee_id]);
        const je=await JournalService.createJournalEntry({date,description:'Advance recovery for payroll #'+id,reference_type:'AdvanceRepayment',reference_id:id,
            lines:[{account_code:6100,debit:deduction},{account_code:1100,credit:deduction}]},client);
        repaymentJeId=je.id;
        let remaining=deduction;
        for(const advance of advances.rows) {
            if(remaining <= 0) break;
            const amount=Math.min(remaining,Number(advance.balance_remaining));
            await client.query("UPDATE salary_advances SET total_repaid=COALESCE(total_repaid,0)+$1,recovered_amount=COALESCE(recovered_amount,0)+$1,balance_remaining=balance_remaining-$1,is_recovered=(balance_remaining-$1 <= 0),status=CASE WHEN balance_remaining-$1 <= 0 THEN 'Recovered' ELSE 'Active' END WHERE id=$2",[amount,advance.id]);
            await client.query('INSERT INTO payroll_recovery_allocations(salary_history_id,advance_id,journal_entry_id,amount) VALUES($1,$2,$3,$4)',[id,advance.id,je.id,amount]);
            await require('../employees/advanceSchedule').recover(client,advance,amount,je.id);
            remaining=Number((remaining-amount).toFixed(2));
        }
        // Older ledger-only advances remain recoverable; partially populated models are rejected.
        if(advances.rowCount && remaining > 0) throw new DomainError('Advance models disagree on outstanding balance',409);
        await client.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,transaction_date,notes,balance_after,journal_entry_id,repayment_source) VALUES($1,'Repayment',$2,$3,$4,$5,$6,'Payroll')",[record.employee_id,deduction,date,'Payroll deduction #'+id,balance-deduction,je.id]);
    }
    if(net > 0) await JournalService.createJournalEntry({date,description:'Payroll payout #'+id,reference_type:'SalaryPayment',reference_id:id,
        lines:[{account_code:6100,debit:net},{account_code:account,credit:net}]},client);
    if(net < 0) {
        const je=await JournalService.createJournalEntry({date,description:'Negative payroll payout #'+id,reference_type:'PayrollShortfall',reference_id:id,lines:[{account_code:1110,debit:-net},{account_code:6100,credit:-net}]},client);
        await client.query('INSERT INTO payroll_shortfalls(salary_history_id,employee_id,amount,journal_entry_id,created_by) VALUES($1,$2,$3,$4,$5)',[id,record.employee_id,-net,je.id,actor.id]);
    }
    const updated=(await client.query("UPDATE salary_history SET status='Paid',payment_mode=$2,payment_date=$3,paid_by=$4,paid_by_user_id=$5 WHERE id=$1 RETURNING *",[id,data.payment_mode || 'Cash',date,data.paid_by ?? actor.full_name,actor.id])).rows[0];
    return {success:true,record:updated,repayment_journal_id:repaymentJeId};
}

async function reversePaid(client, payroll, reason) {
    await assertWritable(client,payroll.payment_date);
    await client.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE',[payroll.employee_id]);
    const shortfalls=await client.query("SELECT * FROM payroll_shortfalls WHERE salary_history_id=$1 AND status<>'Reversed' FOR UPDATE",[payroll.id]);
    if(shortfalls.rows.some(s=>Number(s.settled_amount)>0)) throw new DomainError('Reverse shortfall settlements before correcting payroll',409);
    const sources=await client.query("SELECT j.* FROM journal_entries j WHERE reference_id=$1 AND (reference_type IN ('SalaryPayment','PayrollShortfall') OR (reference_type='AdvanceRepayment' AND EXISTS(SELECT 1 FROM advance_ledger a WHERE a.journal_entry_id=j.id AND a.employee_id=$2 AND a.repayment_source='Payroll'))) AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reference_type='Reversal' AND r.reference_id=j.id::text)",[String(payroll.id),payroll.employee_id]);
    for(const source of sources.rows) {
        const reversal=await JournalService.reverseJournalEntry(source.id,reason,source.transaction_date,client);
        if(source.reference_type === 'AdvanceRepayment') {
            await require('../employees/advanceSchedule').reverse(client,source.id);
            const recovered=(await client.query("SELECT amount FROM advance_ledger WHERE journal_entry_id=$1 AND transaction_type='Repayment'",[source.id])).rows.reduce((sum,r)=>sum+Number(r.amount),0);
            if(recovered > 0) {
                const balance=await AdvanceService.getEmployeeBalance(payroll.employee_id,client);
                await client.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,transaction_date,notes,balance_after,journal_entry_id) VALUES($1,'Advance',$2,$3,$4,$5,$6)",[payroll.employee_id,recovered,source.transaction_date,'Payroll recovery reversal #'+payroll.id,balance+recovered,reversal.id]);
            }
            const allocations=await client.query('SELECT * FROM payroll_recovery_allocations WHERE journal_entry_id=$1 AND reversed=FALSE FOR UPDATE',[source.id]);
            for(const allocation of allocations.rows) {
                await client.query("UPDATE salary_advances SET total_repaid=total_repaid-$1,recovered_amount=recovered_amount-$1,balance_remaining=balance_remaining+$1,is_recovered=FALSE,status='Active' WHERE id=$2",[allocation.amount,allocation.advance_id]);
                await client.query('UPDATE payroll_recovery_allocations SET reversed=TRUE WHERE id=$1',[allocation.id]);
            }
        }
    }
    await client.query("UPDATE payroll_shortfalls SET status='Reversed' WHERE salary_history_id=$1 AND status<>'Reversed'",[payroll.id]);
}
// Read the date without taking a source-row lock, then follow the same day ->
// employee -> salary order used by payout. A concurrent date change is retried.
async function lockForCorrection(client,id) {
    const candidate=(await client.query('SELECT * FROM salary_history WHERE id=$1',[id])).rows[0];
    if(!candidate) throw new DomainError('Payroll record not found',404);
    const day=await assertWritable(client,candidate.payment_date || new Date());
    await client.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE',[candidate.employee_id]);
    const record=(await client.query('SELECT * FROM salary_history WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!record) throw new DomainError('Payroll record not found',404);
    if(record.payment_date && new Date(record.payment_date).toISOString().slice(0,10)!==day) throw new DomainError('Payroll changed during correction; retry',409);
    return record;
}
module.exports={pay,reversePaid,lockForCorrection};
