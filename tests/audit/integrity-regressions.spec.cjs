const {test,expect}=require('./fixtures.cjs');
const {snapshot,requestAdvance,payrollFixture,seedJournal}=require('./helpers.cjs');
const approve=(a,id)=>a.api('POST','employees/payroll/requests/'+id+'/approve',{});
const payout=(a,id)=>a.api('POST','payroll/payout',{id,payment_mode:'Cash',payment_date:a.DATE,paid_by:'Audit owner'});
const revert=(a,id)=>a.api('POST','payroll/revert/'+id,{targetStatus:'Approved',reason:'Integrity regression'});
const advanceState=a=>a.rows('SELECT amount,balance_remaining,recovered_amount,total_repaid,is_recovered,status FROM salary_advances ORDER BY id');
test('ADV-004 manual FIFO repayment updates both balances and processed requests cannot be rejected',async({audit})=>{
  for(const amount of [600,800]) {const r=await requestAdvance(audit,{amount});expect((await approve(audit,r.id)).status).toBe(200);}
  const repayment=await requestAdvance(audit,{type:'Repayment',amount:1000});expect((await approve(audit,repayment.id)).status).toBe(200);
  expect((await advanceState(audit)).map(a=>[Number(a.balance_remaining),Number(a.recovered_amount),Number(a.total_repaid),a.status])).toEqual([[0,600,600,'Recovered'],[400,400,400,'Active']]);
  expect((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(400);
  const before=await snapshot(audit);expect((await audit.api('POST','employees/payroll/requests/'+repayment.id+'/reject',{reason:'Too late'})).status).toBe(409);expect(await snapshot(audit)).toEqual(before);
});
test('PAY-011 deduction payout revert payout restores exact FIFO allocations and journals',async({audit})=>{
  for(const amount of [600,800]) {const r=await requestAdvance(audit,{amount});expect((await approve(audit,r.id)).status).toBe(200);}
  const before=await advanceState(audit), p=await payrollFixture(audit,{deduction:1000,net:29000});
  expect((await payout(audit,p.id)).status).toBe(200);const paid=await advanceState(audit);
  expect((await revert(audit,p.id)).status).toBe(200);expect(await advanceState(audit)).toEqual(before);
  expect((await audit.rows('SELECT reversed FROM payroll_recovery_allocations')).every(a=>a.reversed)).toBe(true);
  expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000'))[0].balance)).toBe(-1400);
  expect((await payout(audit,p.id)).status).toBe(200);expect(await advanceState(audit)).toEqual(paid);
  expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000'))[0].balance)).toBe(-30400);
  expect((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(400);
});
test('PAY-010 payroll reversal leaves a colliding manual repayment and its employee intact',async({audit})=>{
  const r=await requestAdvance(audit,{employee:2,amount:1000});expect((await approve(audit,r.id)).status).toBe(200);
  const manual=await requestAdvance(audit,{employee:2,type:'Repayment',amount:200});expect((await approve(audit,manual.id)).status).toBe(200);
  const p=await payrollFixture(audit);await audit.pool.query('UPDATE salary_history SET id=$1 WHERE id=$2',[manual.id,p.id]);
  expect((await payout(audit,manual.id)).status).toBe(200);
  const before=await audit.rows('SELECT * FROM advance_ledger WHERE employee_id=2 ORDER BY id');
  expect((await revert(audit,manual.id)).status).toBe(200);expect(await audit.rows('SELECT * FROM advance_ledger WHERE employee_id=2 ORDER BY id')).toEqual(before);
  const [source]=await audit.rows("SELECT id FROM journal_entries WHERE reference_type='AdvanceRepayment' AND reference_id=$1",[String(manual.id)]);
  expect(await audit.rows("SELECT id FROM journal_entries WHERE reference_type='Reversal' AND reference_id=$1",[source.id])).toHaveLength(0);
});
test('PAY-009 concurrent payout and correction settle without deadlocks or duplicate cash',async({audit})=>{
  const p=await payrollFixture(audit);expect((await payout(audit,p.id)).status).toBe(200);
  const replies=await Promise.all([revert(audit,p.id),payout(audit,p.id)]);
  expect(replies[0].status).toBe(200);expect([200,409]).toContain(replies[1].status);
  const [state]=await audit.rows('SELECT status FROM salary_history WHERE id=$1',[p.id]);
  const balance=Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000'))[0].balance);
  expect(balance).toBe(state.status==='Paid'?-30000:0);
});
test('CLOSE-001 imported journals with NULL source type count in live closing',async({audit})=>{
  await seedJournal(audit,{type:null,lines:[[1000,123,0],[4000,0,123]]});
  const r=await audit.api('GET','finance/daily-balance/'+audit.DATE);expect(r.status).toBe(200);expect(Number(r.body.expected_closing_calculated)).toBe(123);
});
for(const status of ['Locked','Closed'])test('BILL-007 '+status+' period rejects pending purchase and stock atomically',async({audit})=>{
  await audit.pool.query('INSERT INTO financial_periods(name,start_date,end_date,status) VALUES($1,$2,$2,$1)',[status,audit.DATE]);
  const before=await snapshot(audit);expect((await audit.api('POST','chicken/bills',{date:audit.DATE,supplier_id:1,item_name:'Audit Chicken',qty:2,vendor_rate:160})).status).toBe(400);expect(await snapshot(audit)).toEqual(before);
});

