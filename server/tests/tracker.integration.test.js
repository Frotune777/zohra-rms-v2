const { integration }=require('./helpers/integration');
const ctx=integration();
const service=()=>require('../src/modules/finance/TransactionService');
const sale=(patch={})=>({date:'2026-11-09',type:'Sales',amount:100,payment_method:'Cash',status:'Paid',description:'Jest sale',...patch});

describe('Tracker journals, supplier settlement and correction transactions',()=>{
  test.each([['Cash',1000],['UPI',1020],['Bank',1010]])('posts a %s sale using its actual payment account',async(mode,account)=>{
    const row=await service().createTransaction(sale({payment_method:mode,mode:mode==='Bank'?'Bank':undefined}));
    await ctx.journal('Tracker',row.id,[{account,debit:100,credit:0},{account:4000,debit:0,credit:100}]);
    expect(await ctx.balance(account)).toBe(100);
    expect((await service().getTransactions({date:'2026-11-09',type:'Sales'})).map(t=>t.id)).toEqual([row.id]);
    expect(await service().getSalesByMethod('2026-11-09',mode)).toBe(100);
  });
  test('Bank_Cash sale moves cash to float and creates no revenue',async()=>{
    const row=await service().createTransaction(sale({mode:'Bank_Cash'}));
    await ctx.journal('Tracker',row.id,[{account:1030,debit:100,credit:0},{account:1000,debit:0,credit:100}]);
    expect(await ctx.balance(4000)).toBe(0);
  });
  test('missing mode/status use Cash and Pending defaults',async()=>{
    const row=await service().createTransaction(sale({status:undefined,payment_method:undefined}));
    expect(row.status).toBe('Pending');expect(row.metadata).toEqual({});
    expect(await service().getPendingPayments('2026-11-09')).toBe(100);
    expect(await service().getSumByType('2026-11-09','Sales')).toBe(100);
    expect(await service().getSumByType('2026-11-08','Sales')).toBe(0);
  });
  test('expense category selects its expense account and date range filters exclude other days',async()=>{
    const category=(await ctx.pool.query("INSERT INTO transaction_categories(name,type,account_code) VALUES('Jest expense','Expense',6200) RETURNING id")).rows[0];
    const row=await service().createTransaction(sale({type:'Expense',category_id:category.id,amount:25}));
    await ctx.journal('Tracker',row.id,[{account:6200,debit:25,credit:0},{account:1000,debit:0,credit:25}]);
    await service().createTransaction(sale({date:'2026-11-08'}));
    expect((await service().getTransactions({startDate:'2026-11-09',endDate:'2026-11-09',type:'Expense'})).map(r=>r.id)).toEqual([row.id]);
    expect(await service().getExpensesByMethod('2026-11-09','Cash')).toBe(25);
    expect((await service().getCategories()).map(c=>c.name)).toContain('Jest expense');
  });
  test.each(['Pending','Paid'])('vendor %s expense posts one liability and settles only when paid',async status=>{
    const row=await service().createTransaction(sale({type:'Expense',vendor_id:1,status,amount:120,paid_by:'Jest manager'}));
    await ctx.journal('Tracker',row.id,[{account:6000,debit:120,credit:0},{account:2000,debit:0,credit:120}]);
    const payments=await ctx.rows('SELECT * FROM vendor_payments');
    expect(payments).toHaveLength(status==='Paid'?1:0);
    if(status==='Paid'){
      await ctx.journal('TrackerSettlement',row.id,[{account:2000,debit:120,credit:0},{account:1000,debit:0,credit:120}]);
      expect(payments[0]).toMatchObject({amount:'120.00',paid_by:'Jest manager',status:'Posted'});
    }
    expect(Number((await ctx.rows('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id=1'))[0].outstanding_balance)).toBe(status==='Paid'?0:120);
  });
  test.each([0,-1,null,'',NaN,Infinity,'invalid'])('invalid amount %p leaves every source and balance unchanged',async amount=>{
    const before=await ctx.snapshot();await expect(service().createTransaction(sale({amount}))).rejects.toThrow('Amount');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([{type:'Refund'},{status:'Unknown'},{date:'invalid'},{payment_method:'Unknown'},{type:'Expense',vendor_id:99999},{type:'Expense',category_id:99999}])('rejects invalid transaction %p atomically',async patch=>{
    const before=await ctx.snapshot();await expect(service().createTransaction(sale(patch))).rejects.toThrow();expect(await ctx.snapshot()).toEqual(before);
  });
  test('income category cannot be used as an expense category',async()=>{
    const category=(await ctx.pool.query("INSERT INTO transaction_categories(name,type,account_code) VALUES('Jest income','Income',4000) RETURNING id")).rows[0];
    const before=await ctx.snapshot();await expect(service().createTransaction(sale({type:'Expense',category_id:category.id}))).rejects.toThrow('expense category');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['Locked','Closed'])('%s period rejects creation and correction without writes',async status=>{
    const row=await service().createTransaction(sale());await ctx.closedPeriod(status);const before=await ctx.snapshot();
    await expect(service().createTransaction(sale())).rejects.toThrow('locked');
    await expect(service().updateTransaction(row.id,{amount:50})).rejects.toThrow('locked');
    await expect(service().deleteTransaction(row.id)).rejects.toThrow('locked');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['ledger_lines','vendor_payments','vendor_ledger'])('failure at %s rolls back source, supplier balances and earlier journals',async table=>{
    await ctx.failOn(table);const before=await ctx.snapshot();
    await expect(service().createTransaction(sale({type:'Expense',vendor_id:1,status:'Paid'}))).rejects.toThrow('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test('paid vendor correction reverses the exact original sources and preserves payment history',async()=>{
    const row=await service().createTransaction(sale({type:'Expense',vendor_id:1,amount:120}));
    const originals=await ctx.rows('SELECT id FROM journal_entries WHERE reference_id=$1',[row.id]);
    const updated=await service().updateTransaction(row.id,{amount:80,payment_method:'Bank',description:'Corrected bill'});
    expect(updated.amount).toBe('80.00');
    expect(await ctx.balance(6000)).toBe(80);expect(await ctx.balance(2000)).toBe(0);
    expect(await ctx.balance(1000)).toBe(0);expect(await ctx.balance(1010)).toBe(-80);
    expect((await ctx.rows("SELECT reference_id FROM journal_entries WHERE reference_type='Reversal' ORDER BY reference_id")).map(r=>r.reference_id)).toEqual(originals.map(r=>r.id).sort());
    expect((await ctx.rows('SELECT amount,status FROM vendor_payments ORDER BY id'))).toEqual([{amount:'120.00',status:'Reversed'},{amount:'80.00',status:'Posted'}]);
    const before=await ctx.snapshot();await service().updateTransaction(row.id,{amount:80});await service().updateTransaction(row.id,{ignored_field:'value'});expect(await ctx.snapshot()).toEqual(before);
    await service().deleteTransaction(row.id);
    expect(await ctx.balance(6000)).toBe(0);expect(await ctx.balance(1010)).toBe(0);
    expect(Number((await ctx.rows('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id=1'))[0].outstanding_balance)).toBe(0);
    expect(await service().deleteTransaction(row.id)).toBeNull();
  });
  test('failed repost restores the original transaction and all original journal state',async()=>{
    const row=await service().createTransaction(sale());await ctx.failOn('ledger_lines');const before=await ctx.snapshot();
    await expect(service().updateTransaction(row.id,{type:'Expense',vendor_id:1,amount:50})).rejects.toThrow('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test('supplied client owns commit and rollback of corrections',async()=>{
    const row=await service().createTransaction(sale());const before=await ctx.snapshot();const client=await ctx.pool.connect();
    try{
      await client.query('BEGIN');await service().updateTransaction(row.id,{amount:40},client);
      expect((await client.query('SELECT amount FROM transactions WHERE id=$1',[row.id])).rows[0].amount).toBe('40.00');
      expect(await ctx.snapshot()).toEqual(before);
      await client.query('ROLLBACK');
    }finally{client.release();}
    expect(await ctx.snapshot()).toEqual(before);
  });
  test('updating an unknown transaction fails before writes',async()=>{
    const before=await ctx.snapshot();await expect(service().updateTransaction('00000000-0000-0000-0000-000000000000',{amount:1})).rejects.toMatchObject({status:404});expect(await ctx.snapshot()).toEqual(before);
  });
  test('calendar dates survive database reads and stay on the requested journal day',async()=>{
    const row=await service().createTransaction(sale());
    expect(row.date).toBe('2026-11-09');
    expect(await ctx.rows("SELECT transaction_date::date::text AS day FROM journal_entries WHERE reference_id=$1",[row.id])).toEqual([{day:'2026-11-09'}]);
    const before=await ctx.snapshot();await service().updateTransaction(row.id,{date:'2026-11-09',amount:'100.00'});expect(await ctx.snapshot()).toEqual(before);
  });
  test('changed metadata persists while reordered equal metadata does not fabricate another posting',async()=>{
    const row=await service().createTransaction(sale({metadata:{a:1,b:2}}));
    let before=await ctx.snapshot();await service().updateTransaction(row.id,{metadata:{b:2,a:1}});expect(await ctx.snapshot()).toEqual(before);
    await service().updateTransaction(row.id,{metadata:{a:1,b:3}});
    expect((await service().getTransactions({date:'2026-11-09'}))[0].metadata).toEqual({a:1,b:3});
    expect(await ctx.balance(1000)).toBe(100);
    before=await ctx.snapshot();await service().updateTransaction(row.id,{amount:100.004});expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['update','delete'])('a competing date change forces %s to reject after the controlled lock',async operation=>{
    const row=await service().createTransaction(sale());const blocker=await ctx.pool.connect();let pending;
    try{
      await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtext('finance-day:2026-11-09'))");
      pending=(operation==='update'?service().updateTransaction(row.id,{amount:50}):service().deleteTransaction(row.id)).then(value=>({value}),error=>({error}));
      await ctx.waitForLock();await ctx.pool.query("UPDATE transactions SET date='2026-11-10' WHERE id=$1",[row.id]);const before=await ctx.snapshot();
      await blocker.query('COMMIT');expect((await pending).error).toMatchObject({status:409});expect(await ctx.snapshot()).toEqual(before);
    }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
  });
  test.each(['update','delete'])('a row deleted while %s waits cannot create an orphan correction',async operation=>{
    const row=await service().createTransaction(sale());const blocker=await ctx.pool.connect();let pending;
    try{
      await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtext('finance-day:2026-11-09'))");
      pending=(operation==='update'?service().updateTransaction(row.id,{amount:50}):service().deleteTransaction(row.id)).then(value=>({value}),error=>({error}));
      await ctx.waitForLock();await ctx.pool.query('DELETE FROM transactions WHERE id=$1',[row.id]);const before=await ctx.snapshot();
      await blocker.query('COMMIT');const result=await pending;
      if(operation==='update')expect(result.error).toMatchObject({status:404});else expect(result.value).toBeNull();
      expect(await ctx.snapshot()).toEqual(before);
    }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
  });
});
