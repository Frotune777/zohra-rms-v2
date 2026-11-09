const {integration}=require('./helpers/integration');
const ctx=integration();
async function shortfall(amount=100,employeeId=1){
  const draft=await ctx.api('POST','payroll/run',{month:11,year:2026,employeeId,daysWorked:0,advanceDeduction:0,manualAdjustment:-amount});expect(draft.status).toBe(200);
  const id=draft.body.data[0].id;expect((await ctx.api('POST','payroll/approve',{id})).status).toBe(200);expect((await ctx.api('POST','payroll/payout',{id})).status).toBe(200);return (await ctx.rows('SELECT id FROM payroll_shortfalls WHERE salary_history_id=$1',[id]))[0].id;
}
const settle=(id,patch={})=>ctx.api('POST','payroll/shortfalls/'+id+'/settle',{amount:25,reference:'Jest receipt',...patch});
const reverse=(id,paymentId,patch={})=>ctx.api('POST','payroll/shortfalls/'+id+'/settlements/'+paymentId+'/reverse',{reason:'Wrong receipt',...patch});
describe('Payroll shortfall settlements: source identity, final cents and rollback',()=>{
  test.each([['Cash',1000],['Bank Transfer',1010],['UPI',1020]])('%s settlement and exact reversal preserve signed payroll and receivable',async(mode,account)=>{
    const id=await shortfall();const payment=await settle(id,{paymentMode:mode});expect(payment.status).toBe(200);expect(payment.body).toMatchObject({shortfall_id:id,amount:'25.00',created_by:ctx.actors.owner.id,reversed:false});
    await ctx.journal('PayrollShortfallSettlement','Jest receipt',[{account,debit:25,credit:0},{account:1110,debit:0,credit:25}]);expect(await ctx.balance(1110)).toBe(75);
    expect((await ctx.api('GET','payroll/shortfalls')).body[0]).toMatchObject({outstanding:'75.00',settled_amount:'25.00',status:'Open',settlements:[{id:Number(payment.body.id),reference:'Jest receipt'}]});
    let before=await ctx.snapshot();expect((await settle(id,{paymentMode:mode})).body.id).toBe(payment.body.id);expect(await ctx.snapshot()).toEqual(before);
    expect((await reverse(id,payment.body.id)).status).toBe(200);expect(await ctx.balance(1110)).toBe(100);expect(await ctx.balance(account)).toBe(0);expect(await ctx.rows('SELECT reversed FROM payroll_shortfall_settlements')).toEqual([{reversed:true}]);
    before=await ctx.snapshot();expect((await reverse(id,payment.body.id)).status).toBe(200);expect(await ctx.snapshot()).toEqual(before);expect((await settle(id,{paymentMode:mode})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('partial receipt plus final cent settles exactly; full receipt reversal reopens only its amount',async()=>{
    const id=await shortfall(.03);expect((await settle(id,{amount:.02})).status).toBe(200);const final=await settle(id,{amount:.01,reference:'Final cent'});expect(final.status).toBe(200);
    expect(await ctx.rows('SELECT amount,settled_amount,status FROM payroll_shortfalls')).toEqual([{amount:'0.03',settled_amount:'0.03',status:'Settled'}]);expect(await ctx.balance(1110)).toBe(0);
    const before=await ctx.snapshot();expect((await settle(id,{amount:.01,reference:'Over'})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
    expect((await reverse(id,final.body.id)).status).toBe(200);expect(await ctx.rows('SELECT settled_amount,status FROM payroll_shortfalls')).toEqual([{settled_amount:'0.02',status:'Open'}]);expect(await ctx.balance(1110)).toBe(.01);
  });
  test.each([0,-1,null,'',.001,'bad'])('invalid settlement amount %p creates no receipt or journal',async amount=>{
    const id=await shortfall();const before=await ctx.snapshot();expect((await settle(id,{amount})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([undefined,null,'','   ',42,{}])('invalid receipt reference %p rejects without financial changes',async reference=>{
    const id=await shortfall();const before=await ctx.snapshot();expect((await settle(id,{reference})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('references cannot cross employees, change amount or change payment account',async()=>{
    const id=await shortfall();const other=await shortfall(100,2);expect((await settle(id)).status).toBe(200);const before=await ctx.snapshot();
    for(const [source,patch] of [[other,{}],[id,{amount:26}],[id,{paymentMode:'UPI'}],[id,{amount:76,reference:'Over'}]])expect((await settle(source,patch)).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
    expect((await settle(99999)).status).toBe(404);expect((await settle(id,{paymentMode:'invalid',reference:'Invalid mode'})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('competing receipts cannot collect more than outstanding, even after both clients read the form',async()=>{
    const id=await shortfall();const blocker=await ctx.pool.connect();let responses;
    try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM payroll_shortfalls WHERE id=$1 FOR UPDATE',[id]);
      responses=[settle(id,{amount:80,reference:'First receipt'}),settle(id,{amount:80,reference:'Second receipt'})].map(call=>call.then(value=>value));
      await ctx.waitForLock();await blocker.query('COMMIT');const result=await Promise.all(responses);expect(result.map(r=>r.status).sort()).toEqual([200,409]);
    }finally{await blocker.query('ROLLBACK');blocker.release();if(responses)await Promise.allSettled(responses);}
    expect(await ctx.rows('SELECT settled_amount,status FROM payroll_shortfalls')).toEqual([{settled_amount:'80.00',status:'Open'}]);expect(await ctx.rows('SELECT amount FROM payroll_shortfall_settlements')).toEqual([{amount:'80.00'}]);expect(await ctx.balance(1000)).toBe(80);expect(await ctx.balance(1110)).toBe(20);
  });
  test.each(['ledger_lines','payroll_shortfall_settlements','payroll_shortfalls'])('failure at %s rolls back receipt and outstanding changes',async table=>{
    const id=await shortfall();await ctx.failOn(table,table==='payroll_shortfalls'?'UPDATE':'INSERT');const before=await ctx.snapshot();
    const result=await settle(id);expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([undefined,null,'','   ',42])('invalid reversal reason %p retains the receipt and original journal',async reason=>{
    const id=await shortfall();const payment=await settle(id);const before=await ctx.snapshot();expect((await reverse(id,payment.body.id,{reason})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('reversal rejects mismatched shortfall and unknown receipt identity',async()=>{
    const id=await shortfall();const other=await shortfall(100,2);const payment=await settle(id);const before=await ctx.snapshot();
    expect((await reverse(other,payment.body.id)).status).toBe(404);expect((await reverse(id,99999)).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['ledger_lines','payroll_shortfall_settlements','payroll_shortfalls'])('reversal failure at %s restores reversal and settlement state',async table=>{
    const id=await shortfall();const payment=await settle(id);await ctx.failOn(table,table==='ledger_lines'?'INSERT':'UPDATE');const before=await ctx.snapshot();
    const result=await reverse(id,payment.body.id);expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['Locked','Closed'])('%s financial period blocks settlement and original-day reversal',async status=>{
    const id=await shortfall();const payment=await settle(id);await ctx.closedPeriod(status);const before=await ctx.snapshot();
    expect((await settle(id,{reference:'Locked receipt'})).status).toBe(400);expect((await reverse(id,payment.body.id)).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('staff cannot read or settle shortfalls and read failure is contextual',async()=>{
    const id=await shortfall();const before=await ctx.snapshot();expect((await ctx.api('GET','payroll/shortfalls',undefined,'staff')).status).toBe(403);expect((await ctx.api('POST','payroll/shortfalls/'+id+'/settle',{amount:25,reference:'Staff'},'staff')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
    const realQuery=ctx.db.query.bind(ctx.db);jest.spyOn(ctx.db,'query').mockImplementation((sql,...args)=>sql.includes('FROM payroll_shortfalls s')?Promise.reject(new Error('Jest report unavailable')):realQuery(sql,...args));const result=await ctx.api('GET','payroll/shortfalls');expect(result.status).toBe(500);expect(result.body.error).toBe('Jest report unavailable');expect(await ctx.snapshot()).toEqual(before);
  });
});
