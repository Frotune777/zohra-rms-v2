const {test,expect}=require('./fixtures.cjs');
const {snapshot,seedJournal,journal,requestAdvance,payrollFixture,raceWrites}=require('./helpers.cjs');
const leaveBody={employee_id:1,leave_type:'Paid',start_date:'2026-11-09',end_date:'2026-11-09',reason:'Audit leave'};
async function leave(audit,changes={}){const r=await audit.api('POST','leaves',{...leaveBody,...changes});expect(r.status).toBe(200);return r.body;}
async function run(audit,changes={}){return audit.api('POST','payroll/run',{employeeId:1,month:11,year:2026,daysWorked:30,...changes});}
async function payout(audit,id,mode='Cash'){return audit.api('POST','payroll/payout',{id,payment_mode:mode,payment_date:audit.DATE,paid_by:audit.actors.owner.user.id});}
async function advanceFixture(audit,amount=1000,employee=1){
  await audit.pool.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,balance_after) VALUES($1,'Advance',$2,$2)",[employee,amount]);
  return (await audit.rows("INSERT INTO salary_advances(employee_id,amount,balance_remaining,status,recovered_amount) VALUES($1,$2,$2,'Active',0) RETURNING *",[employee,amount]))[0];
}
test('EMP-001 create, edit and history agree with persisted salary, position, role and status',async({audit,page})=>{
  const created=await audit.api('POST','employees',{full_name:'New Colleague',first_name:'New',last_name:'Colleague',position:'Cook',base_salary:30000});expect(created.status).toBe(201);
  await audit.session(page);await page.goto('/employees');await expect(page.getByText('New Colleague',{exact:true}).first()).toBeVisible();
  const updated=await audit.api('PUT','employees/'+created.body.id,{base_salary:35000,position:'Chef',role:'manager',status:'inactive'});expect(updated.status).toBe(200);
  const history=await audit.api('GET','employees/'+created.body.id+'/history');expect(history.status).toBe(200);
  expect(history.body.map(h=>h.field_changed).sort()).toEqual(['base_salary','position','role','status']);
  expect(history.body.every(h=>h.changed_by==='owner@audit.invalid')).toBe(true);
  const [stored]=await audit.rows('SELECT base_salary,position,status FROM employees WHERE id=$1',[created.body.id]);
  expect(stored).toEqual({base_salary:'35000.00',position:'Chef',status:'inactive'});
});
test('EMP-002 zero salary edits and clearing optional fields do not silently retain old values',async({audit})=>{
  await audit.pool.query("UPDATE employees SET phone_number='123' WHERE id=1");
  const r=await audit.api('PUT','employees/1',{base_salary:0,phone_number:''});expect(r.status).toBe(200);
  const [stored]=await audit.rows('SELECT base_salary,phone_number FROM employees WHERE id=1');
  expect.soft(Number(stored.base_salary)).toBe(0);expect.soft(stored.phone_number).toBe('');
  const history=await audit.api('GET','employees/1/history');
  for(const h of history.body)if(h.field_changed==='base_salary')expect.soft(Number(h.new_value)).toBe(Number(stored.base_salary));
});
test('EMP-003 concurrent creation produces two unique employee codes',async({audit})=>{
  const replies=await raceWrites(audit,'employees',['A','B'].map(name=>()=>audit.api('POST','employees',{full_name:'Concurrent '+name,position:'Cook',base_salary:1000})));
  expect.soft(replies.map(r=>r.status)).toEqual([201,201]);
  const rows=await audit.rows("SELECT employee_code FROM employees WHERE full_name LIKE 'Concurrent %'");
  expect.soft(rows).toHaveLength(2);expect(new Set(rows.map(r=>r.employee_code)).size).toBe(2);
});
test('EMP-004 manager/staff cannot delete; owner receives a conflict for historical payroll dependencies',async({audit})=>{
  for(const role of ['manager','staff'])expect((await audit.api('DELETE','employees/3',undefined,role)).status).toBe(403);
  await payrollFixture(audit,{employee:3});const before=await snapshot(audit,['employees','salary_history']);
  expect.soft((await audit.api('DELETE','employees/3')).status).toBe(409);expect(await snapshot(audit,['employees','salary_history'])).toEqual(before);
});
test('ATT-001 Present, Absent and Half-Day survive repeated bulk saves without duplicate employee dates',async({audit,page})=>{
  const records=[{employee_id:1,status:'Present'},{employee_id:2,status:'Half-Day'},{employee_id:3,status:'Absent'}];
  for(let n=0;n<2;n++)expect((await audit.api('POST','attendance/bulk',{date:audit.DATE,records})).status).toBe(200);
  expect((await audit.rows('SELECT employee_id,status FROM attendance ORDER BY employee_id'))).toEqual(records);
  await audit.session(page);await page.goto('/attendance/bulk');await expect(page.getByText('Audit Staff',{exact:true}).first()).toBeVisible();
});
test('ATT-002 both attendance namespaces persist the same supported statuses',async({audit})=>{
  for(const namespace of ['attendance/bulk','employees/attendance/bulk'])expect((await audit.api('POST',namespace,{date:audit.DATE,records:[{employee_id:1,status:'Half-Day'}]})).status).toBe(200);
  for(const path of ['attendance?date='+audit.DATE,'employees/attendance?date='+audit.DATE]){
    const r=await audit.api('GET',path);expect(r.status).toBe(200);expect(r.body.find(x=>x.employee_id===1).status).toBe('Half-Day');
  }
  expect(await audit.rows('SELECT id FROM attendance')).toHaveLength(1);
});
test('ATT-003 calendar completeness counts active staff and excludes inactive attendance',async({audit})=>{
  const endpoint='attendance/calendar?startDate='+audit.DATE+'&endDate='+audit.DATE;
  expect((await audit.api('GET',endpoint)).body[0].status).toBe('missing');
  await audit.api('POST','attendance/bulk',{date:audit.DATE,records:[{employee_id:1,status:'Present'}]});expect((await audit.api('GET',endpoint)).body[0].status).toBe('partial');
  await audit.api('POST','attendance/bulk',{date:audit.DATE,records:[{employee_id:2,status:'Present'},{employee_id:3,status:'Present'}]});expect((await audit.api('GET',endpoint)).body[0].status).toBe('complete');
  await audit.pool.query("UPDATE employees SET status='inactive' WHERE id=3");expect((await audit.api('GET',endpoint)).body[0].filled_records).toBe(2);
});
for(const namespace of ['attendance/bulk','employees/attendance/bulk'])
  test('ATT-004 '+namespace+' rejects invalid statuses and preserves locked attendance',async({audit})=>{
    const invalid=await audit.api('POST',namespace,{date:audit.DATE,records:[{employee_id:1,status:'garbage'}]});expect.soft(invalid.status).toBe(400);
    await audit.pool.query("INSERT INTO attendance(employee_id,date,status,is_locked) VALUES(2,$1,'Absent',true)",[audit.DATE]);
    expect.soft((await audit.api('POST',namespace,{date:audit.DATE,records:[{employee_id:2,status:'Present'}]})).status).toBe(409);
    expect((await audit.rows('SELECT status FROM attendance WHERE employee_id=2'))[0].status).toBe('Absent');
  });
test('LEAVE-001 owner create/filter/approve/reject/delete transitions persist attendance and status',async({audit})=>{
  const approved=await leave(audit);expect((await audit.api('GET','leaves?status=Pending')).body).toHaveLength(1);
  expect((await audit.api('PUT','leaves/'+approved.id+'/approve',{})).status).toBe(200);
  expect((await audit.rows('SELECT status,leave_request_id FROM attendance WHERE employee_id=1'))).toEqual([{status:'Absent',leave_request_id:approved.id}]);
  const rejected=await leave(audit,{employee_id:2});expect((await audit.api('PUT','leaves/'+rejected.id+'/reject',{rejection_reason:'Audit reject'})).status).toBe(200);
  const pending=await leave(audit,{employee_id:3});expect((await audit.api('DELETE','leaves/'+pending.id)).status).toBe(200);
  expect((await audit.api('GET','leaves?status=Rejected')).body[0].rejection_reason).toBe('Audit reject');
});
test('LEAVE-002 reversed ranges are validation errors and valid cross-year dates retain exact day count',async({audit})=>{
  expect.soft((await audit.api('POST','leaves',{...leaveBody,start_date:'2026-11-10',end_date:'2026-11-09'})).status).toBe(400);
  const valid=await leave(audit,{start_date:'2026-12-31',end_date:'2027-01-01'});expect(valid.total_days).toBe(2);
});
test('LEAVE-003 manager approval works and simultaneous owner approvals create one attendance event',async({audit})=>{
  const first=await leave(audit);expect.soft((await audit.api('PUT','leaves/'+first.id+'/approve',{},'manager')).status).toBe(200);
  const second=await leave(audit,{employee_id:2});const replies=await Promise.all([audit.api('PUT','leaves/'+second.id+'/approve',{}),audit.api('PUT','leaves/'+second.id+'/approve',{})]);
  expect.soft(replies.map(r=>r.status).sort()).toEqual([200,409]);expect(await audit.rows('SELECT id FROM attendance WHERE employee_id=2')).toHaveLength(1);
});
test('LEAVE-004 bulk edits cannot overwrite approved leave attendance',async({audit})=>{
  const request=await leave(audit);expect((await audit.api('PUT','leaves/'+request.id+'/approve',{})).status).toBe(200);
  expect.soft((await audit.api('POST','attendance/bulk',{date:audit.DATE,records:[{employee_id:1,status:'Present'}]})).status).toBe(409);
  expect((await audit.rows('SELECT status FROM attendance WHERE employee_id=1'))[0].status).toBe('Absent');
});
test('LEAVE-005 staff cannot read, submit or delete another employee request',async({audit})=>{
  const request=await leave(audit,{employee_id:3});
  expect.soft((await audit.api('GET','leaves/employee/3',undefined,'staff')).status).toBe(403);
  expect.soft((await audit.api('POST','leaves',{...leaveBody,employee_id:3},'staff')).status).toBe(403);
  expect.soft((await audit.api('DELETE','leaves/'+request.id,undefined,'staff')).status).toBe(403);
});
test('LEAVE-006 Paid leave earns pay while Unpaid leave does not',async({audit})=>{
  for(const [type,date] of [['Paid','2026-11-09'],['Unpaid','2026-11-10']]){
    const r=await leave(audit,{leave_type:type,start_date:date,end_date:date});expect((await audit.api('PUT','leaves/'+r.id+'/approve',{})).status).toBe(200);
  }
  const r=await run(audit,{daysWorked:undefined});expect(r.status).toBe(200);expect(Number(r.body.data[0].calculated_salary)).toBe(1000);
});
test('ADV-001 both advance request APIs persist their declared request contracts',async({audit})=>{
  const legacy=await requestAdvance(audit);expect(legacy.requested_amount).toBe('1000.00');expect(legacy.type).toBe('Advance');
  const standalone=await audit.api('POST','advance-requests',{employee_id:2,requested_amount:900,reason:'Audit schedule',repayment_months:3});expect(standalone.status).toBe(200);
  expect(standalone.body.requested_amount).toBe('900.00');expect(standalone.body.monthly_deduction).toBe('300.00');expect(standalone.body.status).toBe('Pending');
});
test('ADV-002 manager approves a legacy request once with a source-linked ledger and journal',async({audit})=>{
  const request=await requestAdvance(audit);const r=await audit.api('POST','employees/payroll/requests/'+request.id+'/approve',{},'manager');expect(r.status).toBe(200);
  await journal(audit,'AdvanceAdvance',request.id,[{account:1100,debit:1000,credit:0},{account:1000,debit:0,credit:1000}]);
  expect((await audit.rows('SELECT amount,balance_after,approved_by FROM advance_ledger'))[0]).toEqual({amount:'1000.00',balance_after:'1000.00',approved_by:audit.actors.manager.user.id});
  const before=await snapshot(audit);expect.soft((await audit.api('POST','employees/payroll/requests/'+request.id+'/approve',{},'manager')).status).toBe(409);expect(await snapshot(audit)).toEqual(before);
});
test('ADV-002 manager can approve the standalone repayment-schedule request',async({audit})=>{
  const r=await audit.api('POST','advance-requests',{employee_id:1,requested_amount:1000,reason:'Audit standalone',repayment_months:3});expect(r.status).toBe(200);
  expect((await audit.api('PUT','advance-requests/'+r.body.id+'/approve',{approved_amount:1000,repayment_months:3},'manager')).status).toBe(200);
});
test('ADV-003 jointly excessive concurrent repayments cannot produce negative employee receivables',async({audit})=>{
  await advanceFixture(audit,1000);const first=await requestAdvance(audit,{type:'Repayment',amount:600});const second=await requestAdvance(audit,{type:'Repayment',amount:600});
  const replies=await raceWrites(audit,'advance_ledger',[()=>audit.api('POST','employees/payroll/requests/'+first.id+'/approve',{}),()=>audit.api('POST','employees/payroll/requests/'+second.id+'/approve',{})]);
  expect.soft(replies.filter(r=>r.status===200)).toHaveLength(1);expect((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(400);
});
test('ADV-004 invalid amounts and negative repayment months are rejected without schedules',async({audit})=>{
  for(const amount of [0,-1])expect((await audit.api('POST','employees/payroll/advance',{employeeId:1,type:'Advance',amount})).status).toBe(400);
  expect.soft((await audit.api('POST','advance-requests',{employee_id:1,requested_amount:-10,reason:'Invalid',repayment_months:-1})).status).toBe(400);
  expect(await audit.rows('SELECT id FROM advance_requests')).toHaveLength(0);
});
test('ADV-005 installment cents sum exactly to the approved amount',async({audit})=>{
  const r=await audit.api('POST','advance-requests',{employee_id:1,requested_amount:1000,reason:'Rounding',repayment_months:3});expect(r.status).toBe(200);
  expect((await audit.api('PUT','advance-requests/'+r.body.id+'/approve',{approved_amount:1000,repayment_months:3})).status).toBe(200);
  const schedule=await audit.api('GET','advance-requests/'+r.body.id+'/repayment-schedule');expect(schedule.status).toBe(200);
  expect(schedule.body).toHaveLength(3);expect(schedule.body.reduce((sum,s)=>sum+Math.round(Number(s.scheduled_amount)*100),0)).toBe(100000);
});
test.describe('ADV-005 month-end schedules',()=>{
  test.use({businessInstant:'2026-01-31T12:00:00Z'});
  test('ADV-005 January 31 schedules use February month-end instead of overflowing to March',async({audit})=>{
    const r=await audit.api('POST','advance-requests',{employee_id:1,requested_amount:900,reason:'Month end',repayment_months:3});expect(r.status).toBe(200);
    expect((await audit.api('PUT','advance-requests/'+r.body.id+'/approve',{approved_amount:900,repayment_months:3})).status).toBe(200);
    const dates=await audit.rows('SELECT due_date::text FROM advance_repayment_schedule ORDER BY month_number');expect(dates[0].due_date).toBe('2026-02-28');
  });
});
test('ADV-006 failure to auto-approve a transfer leaves no partial advance request',async({audit})=>{
  const before=await snapshot(audit);expect.soft((await audit.api('POST','finance/transfer/safe-to-user',{toUserId:1,targetType:'employee',amount:1000,mode:'invalid',description:'Must roll back'})).status).toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
for(const [days,salary] of [[0,0],[0.5,500],[15,15000],[30,30000]])
  test('PAY-001 explicit '+days+' days draft earns exactly '+salary,async({audit})=>{
    const r=await run(audit,{daysWorked:days});expect(r.status).toBe(200);expect(Number(r.body.data[0].calculated_salary)).toBe(salary);expect(Number(r.body.data[0].net_pay)).toBe(salary);
    expect(await audit.rows('SELECT id FROM journal_entries')).toHaveLength(0);
  });
test('PAY-002 February leap and non-leap proration uses the correct month length',async({audit})=>{
  for(const [year,days] of [[2024,14.5],[2025,14]]){
    const r=await run(audit,{month:2,year,daysWorked:days});expect(r.status).toBe(200);expect(Number(r.body.data[0].calculated_salary)).toBe(15000);
  }
});
test('PAY-003 components, overtime, extra days and negative adjustment reconcile the draft',async({audit})=>{
  for(const [name,type,amount] of [['Base','Earning',28000],['Allowance','Earning',2000],['PF','Deduction',1000]]){
    const [c]=await audit.rows('INSERT INTO salary_components(name,type) VALUES($1,$2) RETURNING id',[name,type]);
    await audit.pool.query('INSERT INTO employee_salary_structure(employee_id,component_id,amount) VALUES(1,$1,$2)',[c.id,amount]);
  }
  const r=await run(audit,{daysWorked:15,overtimeHours:2,overtimeAmount:200,extraDays:1,extraDayAmount:100,manualAdjustment:-50});expect(r.status).toBe(200);
  expect(Number(r.body.data[0].calculated_salary)).toBe(15250);expect(Number(r.body.data[0].net_pay)).toBe(14750);
  const components=await audit.rows('SELECT amount,type FROM salary_history_components');
  expect(components.reduce((sum,c)=>sum+(c.type==='Earning'?1:-1)*Number(c.amount),0)).toBe(14750);
});
test('PAY-004 advance recovery can exceed salary and rejects recovery beyond outstanding debt',async({audit})=>{
  await advanceFixture(audit,40000);const r=await run(audit,{advanceDeduction:40000});expect(r.status).toBe(200);
  expect(Number(r.body.data[0].advance_deduction)).toBe(40000);expect(Number(r.body.data[0].net_pay)).toBe(-10000);
  const before=await snapshot(audit);expect((await run(audit,{advanceDeduction:50000})).status).toBe(400);expect(await snapshot(audit)).toEqual(before);
});
test('PAY-005 regenerating an approved record does not silently change its locked salary',async({audit})=>{
  const existing=await payrollFixture(audit);const r=await run(audit,{daysWorked:15});audit.check('Regeneration response',r.status);
  expect((await audit.rows('SELECT status,net_pay FROM salary_history WHERE id=$1',[existing.id]))[0]).toEqual({status:'Approved',net_pay:'30000.00'});
});
test('PAY-006 approval and payout reject repeated or out-of-order transitions',async({audit})=>{
  const draft=await payrollFixture(audit,{status:'Pending'});expect.soft((await payout(audit,draft.id)).status).toBe(409);
  expect((await audit.api('POST','payroll/approve',{id:draft.id})).status).toBe(200);
  expect.soft((await audit.api('POST','payroll/approve',{id:draft.id})).status).toBe(409);
  expect(await audit.rows('SELECT id FROM journal_entries')).toHaveLength(0);
});
test('PAY-007 FIFO partial recovery reconciles both advance models, ledger and source journals',async({audit})=>{
  const first=await advanceFixture(audit,600),second=await advanceFixture(audit,800);
  const payroll=await payrollFixture(audit,{deduction:1000,net:29000});const r=await payout(audit,payroll.id);expect(r.status).toBe(200);
  const advances=await audit.rows('SELECT recovered_amount,is_recovered,balance_remaining FROM salary_advances ORDER BY id');
  expect(advances.map(a=>Number(a.recovered_amount))).toEqual([600,400]);expect(advances.map(a=>a.is_recovered)).toEqual([true,false]);
  expect.soft(advances.map(a=>Number(a.balance_remaining))).toEqual([0,400]);
  expect((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(400);
  await journal(audit,'AdvanceRepayment',payroll.id,[{account:6100,debit:1000,credit:0},{account:1100,debit:0,credit:1000}]);
  await journal(audit,'SalaryPayment',payroll.id,[{account:6100,debit:29000,credit:0},{account:1000,debit:0,credit:29000}]);
});
test('PAY-008 zero-net payroll completes advance recovery without invalid zero payment lines',async({audit})=>{
  await advanceFixture(audit,30000);const payroll=await payrollFixture(audit,{deduction:30000,net:0});expect((await payout(audit,payroll.id)).status).toBe(200);
  expect((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(0);
});
for(const mode of ['Cash','UPI','Card','Bank Transfer'])
  test('PAY-009 '+mode+' payout commits once despite concurrent repeated submissions',async({audit})=>{
    const payroll=await payrollFixture(audit);const replies=await Promise.all([payout(audit,payroll.id,mode),payout(audit,payroll.id,mode)]);
    expect.soft(replies.map(r=>r.status).sort()).toEqual([200,409]);expect(await audit.rows("SELECT id FROM journal_entries WHERE reference_type='SalaryPayment' AND reference_id=$1",[String(payroll.id)])).toHaveLength(1);
  });
test('PAY-010 reverting one of two same-date payouts preserves the other and reverses cash exactly',async({audit})=>{
  const first=await payrollFixture(audit),second=await payrollFixture(audit,{employee:2,net:45000});expect((await payout(audit,first.id)).status).toBe(200);expect((await payout(audit,second.id)).status).toBe(200);
  const otherBefore=await audit.rows("SELECT * FROM journal_entries WHERE reference_type='SalaryPayment' AND reference_id=$1",[String(second.id)]);
  expect((await audit.api('POST','payroll/revert/'+first.id,{targetStatus:'Approved',reason:'Audit correction'})).status).toBe(200);
  expect.soft(await audit.rows("SELECT * FROM journal_entries WHERE reference_type='SalaryPayment' AND reference_id=$1",[String(second.id)])).toEqual(otherBefore);
  expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000'))[0].balance)).toBe(-45000);
});
test('PAY-011 paid to approved to paid restores one net payout across the complete round trip',async({audit})=>{
  const payroll=await payrollFixture(audit);expect((await payout(audit,payroll.id)).status).toBe(200);
  expect((await audit.api('POST','payroll/revert/'+payroll.id,{targetStatus:'Approved',reason:'Audit repay'})).status).toBe(200);
  expect((await payout(audit,payroll.id)).status).toBe(200);
  expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000'))[0].balance)).toBe(-30000);
});
test('PAY-012 legacy zero-days payroll never substitutes a full month',async({audit})=>{
  const r=await audit.api('POST','employees/payroll/run',{employeeId:1,month:11,year:2026,daysWorked:0});expect(r.status).toBe(200);
  expect(Number(r.body.earnedSalary)).toBe(0);expect(Number(r.body.netPay)).toBe(0);
});
