const {integration}=require('./helpers/integration');
const ctx=integration();
const draft=(patch={})=>ctx.api('POST','payroll/run',{month:11,year:2026,employeeId:1,daysWorked:1,advanceDeduction:0,...patch});
const leave=(patch={},role='owner')=>ctx.api('POST','leaves',{employee_id:1,leave_type:'Paid',start_date:'2026-11-09',end_date:'2026-11-10',reason:'Jest leave',...patch},role);
async function advance(amount=100,months=3){
  const result=await ctx.api('POST','advance-requests',{employee_id:1,requested_amount:amount,reason:'Jest loan',repayment_months:months});expect(result.status).toBe(200);return result.body;
}
async function approveAdvance(row,amount=100,months=3){return ctx.api('PUT','advance-requests/'+row.id+'/approve',{approved_amount:amount,repayment_months:months,payment_mode:'Cash'});}
async function paid(patch={}){
  const generated=await draft(patch);expect(generated.status).toBe(200);const id=generated.body.data[0].id;
  expect((await ctx.api('POST','payroll/approve',{id})).status).toBe(200);
  const result=await ctx.api('POST','payroll/payout',{id});expect(result.status).toBe(200);return id;
}

describe('Leave ownership, transitions, audit and earned salary',()=>{
  test.each(['Sick','Casual','Paid','Unpaid','Emergency'])('supports the UI leave type %s without creating attendance before approval',async leave_type=>{
    const result=await leave({leave_type});expect(result.status).toBe(200);expect(result.body).toMatchObject({leave_type,status:'Pending'});expect(await ctx.rows('SELECT id FROM attendance')).toEqual([]);
  });
  test('inclusive Paid leave creates linked attendance once and earns salary once',async()=>{
    const paidLeave=await leave();const unpaid=await leave({leave_type:'Unpaid',start_date:'2026-11-11',end_date:'2026-11-11'});
    expect((await ctx.api('PUT','leaves/'+paidLeave.body.id+'/approve',{},'manager')).status).toBe(200);
    expect((await ctx.api('PUT','leaves/'+unpaid.body.id+'/approve')).status).toBe(200);
    await ctx.pool.query("INSERT INTO attendance(employee_id,date,status) VALUES(1,'2026-11-01','Present'),(1,'2026-11-02','Half-Day')");
    const result=await draft({daysWorked:undefined});expect(result.status).toBe(200);
    expect(result.body.data[0]).toMatchObject({days_worked:'3.50',calculated_salary:'3500.00',net_pay:'3500.00',paid_leave_days:2,attendance_missing:false});
    expect(await ctx.rows('SELECT status,leave_request_id FROM attendance WHERE leave_request_id=$1 ORDER BY date',[paidLeave.body.id])).toEqual([{status:'Absent',leave_request_id:paidLeave.body.id},{status:'Absent',leave_request_id:paidLeave.body.id}]);
    expect((await ctx.rows('SELECT changed_by FROM attendance_audit_log WHERE employee_id=1 ORDER BY id')).map(a=>a.changed_by)).toEqual([ctx.actors.manager.id,ctx.actors.manager.id,ctx.actors.owner.id]);
    const before=await ctx.snapshot();expect((await ctx.api('PUT','leaves/'+paidLeave.body.id+'/approve')).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('owner filters overlap dates; staff reads only their linked employee',async()=>{
    const own=await leave({},'staff');const other=await leave({employee_id:2});
    expect((await ctx.api('GET','leaves?status=Pending&startDate=2026-11-10&endDate=2026-11-12&employeeId=2')).body.map(r=>r.id)).toEqual([other.body.id]);
    expect((await ctx.api('GET','leaves?employeeId=2',undefined,'staff')).body.map(r=>r.id)).toEqual([own.body.id]);
    expect((await ctx.api('GET','leaves/employee/1',undefined,'staff')).body.map(r=>r.id)).toEqual([own.body.id]);
    expect((await ctx.api('GET','leaves/date/2026-11-09',undefined,'staff')).body.map(r=>r.id)).toEqual([own.body.id]);
    const before=await ctx.snapshot();expect((await leave({employee_id:2},'staff')).status).toBe(403);expect((await ctx.api('GET','leaves/employee/2',undefined,'staff')).status).toBe(403);expect((await ctx.api('DELETE','leaves/'+other.body.id,undefined,'staff')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['employee_id','leave_type','start_date','end_date'])('missing %s rejects leave creation without writes',async field=>{
    const before=await ctx.snapshot();expect((await leave({[field]:undefined})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([{leave_type:'Other'},{start_date:'2026-11-12'},{start_date:'not a date'},{employee_id:99999}])('invalid leave %p does not create source rows',async patch=>{
    const before=await ctx.snapshot();const result=await leave(patch);expect(result.status).toBe(patch.employee_id===99999?409:400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('approval over locked or already linked attendance rolls back the request status',async()=>{
    const row=await leave();await ctx.pool.query("INSERT INTO attendance(employee_id,date,status,is_locked) VALUES(1,'2026-11-09','Present',TRUE)");const before=await ctx.snapshot();
    expect((await ctx.api('PUT','leaves/'+row.body.id+'/approve')).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('late attendance audit failure rolls back all leave and attendance changes',async()=>{
    const row=await leave();await ctx.failOn('attendance_audit_log');const before=await ctx.snapshot();expect((await ctx.api('PUT','leaves/'+row.body.id+'/approve')).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
  test('rejection and pending deletion preserve approval history and never create attendance',async()=>{
    const row=await leave();const rejected=await ctx.api('PUT','leaves/'+row.body.id+'/reject',{rejection_reason:'No cover'});expect(rejected.status).toBe(200);expect(rejected.body).toMatchObject({status:'Rejected',approved_by:ctx.actors.owner.id,rejection_reason:'No cover'});
    const before=await ctx.snapshot();expect((await ctx.api('PUT','leaves/'+row.body.id+'/reject',{})).status).toBe(404);expect((await ctx.api('DELETE','leaves/'+row.body.id)).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
    const pending=await leave({},'staff');expect((await ctx.api('DELETE','leaves/'+pending.body.id,undefined,'staff')).status).toBe(200);expect(await ctx.rows('SELECT id FROM attendance')).toEqual([]);
  });
  test('staff with no employee link cannot list/create/date-query another employee leave',async()=>{
    await ctx.pool.query('UPDATE users SET employee_id=NULL WHERE id=$1',[ctx.actors.staff.id]);const before=await ctx.snapshot();
    for(const path of ['leaves','leaves/date/2026-11-09'])expect((await ctx.api('GET',path,undefined,'staff')).status).toBe(403);
    expect((await leave({},'staff')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
  });
});

describe('Scheduled advances: cents, leap dates, exact allocation and reversal',()=>{
  test.each([['2027-01-31T12:00:00Z',['2027-02-28','2027-03-31','2027-04-30']],['2028-01-31T12:00:00Z',['2028-02-29','2028-03-31','2028-04-30']]])('schedule from %s conserves cents and clamps dates',async(instant,dates)=>{
    const row=await advance();await ctx.at(instant,async()=>expect((await approveAdvance(row)).status).toBe(200));
    expect(await ctx.rows('SELECT due_date::text AS day,scheduled_amount,status FROM advance_repayment_schedule ORDER BY month_number')).toEqual(dates.map((day,i)=>({day,scheduled_amount:i===2?'33.34':'33.33',status:'Pending'})));
    await ctx.journal('AdvanceAdvance',row.id,[{account:1100,debit:100,credit:0},{account:1000,debit:0,credit:100}]);
  });
  test('tiny loan marks zero installments Paid and assigns final cents exactly',async()=>{
    const row=await advance(.02);expect((await approveAdvance(row,.02)).status).toBe(200);
    expect(await ctx.rows('SELECT scheduled_amount,status FROM advance_repayment_schedule ORDER BY month_number')).toEqual([{scheduled_amount:'0.00',status:'Paid'},{scheduled_amount:'0.00',status:'Paid'},{scheduled_amount:'0.02',status:'Pending'}]);
  });
  test.each([0,-1,1.5,null,'invalid'])('invalid months %p are rejected before approval/disbursement',async months=>{
    const row=await advance();const before=await ctx.snapshot();expect((await approveAdvance(row,100,months)).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('manual recovery spans installments; exact reversal retains later payroll recovery',async()=>{
    const row=await advance();expect((await approveAdvance(row)).status).toBe(200);
    const manual=await ctx.api('POST','employees/payroll/advance',{employeeId:1,type:'Repayment',amount:40,notes:'Manual recovery',paymentMode:'Cash',paidBy:ctx.actors.owner.id});expect(manual.status).toBe(200);
    expect((await ctx.api('POST','employees/payroll/requests/'+manual.body.request.id+'/approve')).status).toBe(200);
    await paid({daysWorked:0,advanceDeduction:10});
    const result=await ctx.api('POST','employees/payroll/requests/'+manual.body.request.id+'/reverse',{reason:'Wrong receipt'});expect(result.status).toBe(200);
    expect(await ctx.rows('SELECT balance_remaining,total_repaid,recovered_amount FROM salary_advances')).toEqual([{balance_remaining:'90.00',total_repaid:'10.00',recovered_amount:'10.00'}]);
    expect((await ctx.rows('SELECT recovered_amount,status FROM advance_repayment_schedule ORDER BY month_number'))).toEqual([{recovered_amount:'0.00',status:'Pending'},{recovered_amount:'10.00',status:'Partial'},{recovered_amount:'0.00',status:'Pending'}]);
    const before=await ctx.snapshot();expect((await ctx.api('POST','employees/payroll/requests/'+manual.body.request.id+'/reverse',{reason:'Wrong receipt'})).status).toBe(200);expect(await ctx.snapshot()).toEqual(before);
    expect((await ctx.api('POST','employees/payroll/requests/'+manual.body.request.id+'/reverse',{reason:'Another reason'})).status).toBe(409);
  });
  test('inconsistent installment debt aborts a recovery after earlier installment writes',async()=>{
    const row=await advance();expect((await approveAdvance(row)).status).toBe(200);await ctx.pool.query('UPDATE advance_repayment_schedule SET scheduled_amount=1');
    const request=await ctx.api('POST','employees/payroll/advance',{employeeId:1,type:'Repayment',amount:10,notes:'Mismatch',paymentMode:'Cash',paidBy:ctx.actors.owner.id});const before=await ctx.snapshot();
    expect((await ctx.api('POST','employees/payroll/requests/'+request.body.request.id+'/approve')).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('late schedule write failure restores journal, ledger, loan and approval state',async()=>{
    const row=await advance();await ctx.failOn('advance_repayment_schedule','INSERT','NEW.month_number=2');const before=await ctx.snapshot();expect((await approveAdvance(row)).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
  test('requests can be rejected once; staff see only their own schedule',async()=>{
    const row=await advance();expect((await ctx.api('GET','advance-requests?status=Pending&employeeId=1',undefined,'staff')).body.map(r=>r.id)).toEqual([row.id]);
    expect((await ctx.api('PUT','advance-requests/'+row.id+'/reject',{rejection_reason:'Declined'})).status).toBe(200);
    const before=await ctx.snapshot();expect((await approveAdvance(row)).status).toBe(409);expect((await ctx.api('PUT','advance-requests/'+row.id+'/reject',{})).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
    expect((await ctx.api('GET','advance-requests/'+row.id+'/repayment-schedule',undefined,'staff')).body).toEqual([]);
    await ctx.pool.query('UPDATE advance_requests SET employee_id=2 WHERE id=$1',[row.id]);expect((await ctx.api('GET','advance-requests/'+row.id+'/repayment-schedule',undefined,'staff')).status).toBe(403);
  });
});

describe('Payroll drafts and payout: signed money, components and complete rollback',()=>{
  test.each([0,.5,1,30])('explicit days %p produce a draft and no journal',async days=>{
    const result=await draft({daysWorked:days});expect(result.status).toBe(200);expect(Number(result.body.data[0].net_pay)).toBe(days*1000);expect(await ctx.rows('SELECT id FROM journal_entries')).toEqual([]);
  });
  test('missing attendance is flagged; inactive employees are excluded from bulk drafts',async()=>{
    await ctx.pool.query("UPDATE employees SET status='inactive' WHERE id=3");const result=await draft({employeeId:undefined,daysWorked:undefined,advanceDeduction:undefined});expect(result.status).toBe(200);
    expect(result.body.data.map(r=>r.employee_id)).toEqual([1,2]);expect(result.body.data.every(r=>r.attendance_missing)).toBe(true);
  });
  test.each([{month:0},{month:13},{month:1.5},{year:'invalid'},{daysWorked:-1},{daysWorked:31},{overtimeAmount:-1},{extraDayAmount:-1},{manualAdjustment:'invalid'},{advanceDeduction:1}])('invalid payroll input %p rolls back draft/component writes',async patch=>{
    const before=await ctx.snapshot();expect((await draft(patch)).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('components, overtime, extra days and signed adjustment prorate independently',async()=>{
    const earning=(await ctx.pool.query("INSERT INTO salary_components(name,type) VALUES('Jest earning','Earning') RETURNING id")).rows[0];const deduction=(await ctx.pool.query("INSERT INTO salary_components(name,type) VALUES('Jest deduction','Deduction') RETURNING id")).rows[0];
    await ctx.pool.query('INSERT INTO employee_salary_structure(employee_id,component_id,amount) VALUES(1,$1,1500),(1,$2,100)',[earning.id,deduction.id]);
    const result=await draft({daysWorked:15,overtimeAmount:20,overtimeHours:2,extraDayAmount:10,extraDays:1,manualAdjustment:-5,adjustmentReason:'Correction'});expect(result.status).toBe(200);expect(result.body.data[0]).toMatchObject({calculated_salary:'775.00',net_pay:'725.00'});
    expect(await ctx.rows('SELECT component_name,amount,type FROM salary_history_components ORDER BY component_name')).toEqual([{component_name:'Extra Days',amount:'10.00',type:'Earning'},{component_name:'Jest deduction',amount:'50.00',type:'Deduction'},{component_name:'Jest earning',amount:'750.00',type:'Earning'},{component_name:'Manual Adjustment',amount:'5.00',type:'Deduction'},{component_name:'Overtime',amount:'20.00',type:'Earning'}]);
  });
  test('Approved/Paid reruns retain the locked draft and Pending reruns replace component rows',async()=>{
    const initial=await draft();const id=initial.body.data[0].id;expect((await draft({manualAdjustment:5})).body.data[0].id).toBe(id);
    expect((await ctx.api('POST','payroll/approve',{id})).status).toBe(200);const before=await ctx.snapshot();expect((await draft({daysWorked:2})).body.data).toEqual([]);expect(await ctx.snapshot()).toEqual(before);
    expect((await ctx.api('POST','payroll/payout',{id})).status).toBe(200);const paidBefore=await ctx.snapshot();expect((await draft()).body.data).toEqual([]);expect(await ctx.snapshot()).toEqual(paidBefore);
  });
  test.each([0,1])('zero/positive payout with %i days uses only the expected cash movement',async days=>{
    const id=await paid({daysWorked:days});expect(await ctx.balance(1000)).toBe(days?-1000:0);expect(await ctx.rows('SELECT id FROM payroll_shortfalls')).toEqual([]);
    if(days)await ctx.journal('SalaryPayment',id,[{account:6100,debit:1000,credit:0},{account:1000,debit:0,credit:1000}]);
    else expect(await ctx.rows('SELECT id FROM journal_entries')).toEqual([]);
    const before=await ctx.snapshot();expect((await ctx.api('POST','payroll/payout',{id})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('uncapped recovery creates signed negative payout with exact shortfall and no payout cash',async()=>{
    const loan=await advance(125);expect((await approveAdvance(loan,125)).status).toBe(200);const id=await paid({daysWorked:0,advanceDeduction:undefined});
    expect((await ctx.rows('SELECT net_pay,status FROM salary_history WHERE id=$1',[id]))).toEqual([{net_pay:'-125.00',status:'Paid'}]);
    expect(await ctx.balance(1000)).toBe(-125);expect(await ctx.balance(1100)).toBe(0);expect(await ctx.balance(1110)).toBe(125);
    await ctx.journal('PayrollShortfall',id,[{account:1110,debit:125,credit:0},{account:6100,debit:0,credit:125}]);
    expect(await ctx.rows('SELECT amount,created_by,status FROM payroll_shortfalls')).toEqual([{amount:'125.00',created_by:ctx.actors.owner.id,status:'Open'}]);
  });
  test.each(['payroll_shortfalls','salary_history'])('late payout failure at %s restores exact debt and allocation state',async table=>{
    const loan=await advance(125);expect((await approveAdvance(loan,125)).status).toBe(200);const generated=await draft({daysWorked:0,advanceDeduction:undefined});const id=generated.body.data[0].id;await ctx.api('POST','payroll/approve',{id});
    await ctx.failOn(table,table==='salary_history'?'UPDATE':'INSERT');const before=await ctx.snapshot();expect((await ctx.api('POST','payroll/payout',{id})).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
  test('payout requires Approved status and a valid source row',async()=>{
    const generated=await draft();const before=await ctx.snapshot();expect((await ctx.api('POST','payroll/payout',{id:generated.body.data[0].id})).status).toBe(409);expect((await ctx.api('POST','payroll/payout',{id:99999})).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
  });
  test('settlement blocks payroll correction until its exact receipt is reversed',async()=>{
    const loan=await advance(125);await approveAdvance(loan,125);const id=await paid({daysWorked:0,advanceDeduction:undefined});const short=(await ctx.rows('SELECT id FROM payroll_shortfalls'))[0];
    const payment=await ctx.api('POST','payroll/shortfalls/'+short.id+'/settle',{amount:25,reference:'Jest settlement'});expect(payment.status).toBe(200);
    await ctx.journal('PayrollShortfallSettlement','Jest settlement',[{account:1000,debit:25,credit:0},{account:1110,debit:0,credit:25}]);
    const before=await ctx.snapshot();expect((await ctx.api('POST','payroll/revert/'+id,{targetStatus:'Approved',reason:'Correct pay'})).status).toBe(409);expect((await ctx.api('DELETE','payroll/'+id,{reason:'Correct pay'})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
    expect((await ctx.api('POST','payroll/shortfalls/'+short.id+'/settlements/'+payment.body.id+'/reverse',{reason:'Reverse receipt'})).status).toBe(200);
    expect((await ctx.api('POST','payroll/revert/'+id,{targetStatus:'Approved',reason:'Correct pay'})).status).toBe(200);
    expect(await ctx.balance(1100)).toBe(125);expect(await ctx.balance(1110)).toBe(0);expect(await ctx.rows('SELECT balance_remaining FROM salary_advances')).toEqual([{balance_remaining:'125.00'}]);
    expect((await ctx.api('POST','payroll/revert/'+id,{targetStatus:'Pending',reason:'Edit draft'})).status).toBe(200);
    expect((await ctx.api('DELETE','payroll/'+id,{reason:'Remove draft'})).status).toBe(200);expect(await ctx.rows('SELECT id FROM salary_history')).toEqual([]);
    expect((await ctx.rows('SELECT action,performed_by FROM payroll_audit_log ORDER BY id')).map(r=>r.performed_by)).toEqual([ctx.actors.owner.id,ctx.actors.owner.id,ctx.actors.owner.id]);
  });
});
