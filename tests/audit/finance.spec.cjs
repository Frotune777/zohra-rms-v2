const {test,expect}=require('./fixtures.cjs');
const {snapshot,seedJournal,journal,requestAdvance}=require('./helpers.cjs');
async function category(audit){return (await audit.rows("SELECT id,account_code FROM transaction_categories WHERE type='Expense' AND account_code IS NOT NULL ORDER BY id LIMIT 1"))[0];}
async function tracker(audit,changes={}){return audit.api('POST','finance/tracker/transaction',{date:audit.DATE,type:'Sales',amount:100,payment_method:'Cash',status:'Paid',mode:'Cash',description:'Audit tracker',...changes});}
async function balance(audit,date=audit.DATE,type='Counter',code){return audit.api('GET','finance/daily-balance/'+date+'?type='+type+(code?'&accountCode='+code:''));}
async function close(audit,actual=0,type='Counter',date=audit.DATE,code){return audit.api('POST','finance/daily-balance/close',{date,type,actualClosingBalance:actual,...(code?{accountCode:code}:{})});}
async function reopen(audit,role='owner',changes={}){return audit.api('POST','finance/daily-balance/reopen',{date:audit.DATE,type:'Counter',reason:'Audit recount',...changes},role);}
async function varianceAccounts(audit){
  // Supplemental test fixture only; default schema failure is tested separately.
  await audit.pool.query("INSERT INTO chart_of_accounts(code,name,type) VALUES(7000,'Fixture cash shortage','Expense'),(7100,'Fixture cash excess','Revenue') ON CONFLICT DO NOTHING");
  audit.check('Supplemental variance accounts',[7000,7100]);
}
async function failWrite(audit,table,event='INSERT'){
  if(!['ledger_lines','audit_logs'].includes(table))throw new Error('Unsafe injection table');
  await audit.pool.query("CREATE FUNCTION audit_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit injected write failure'; END $$");
  await audit.pool.query('CREATE TRIGGER audit_fail_write BEFORE '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION audit_fail_write()');
}
async function conserved(audit){return Number((await audit.rows("SELECT COALESCE(sum(debit-credit),0) AS amount FROM ledger_lines l JOIN chart_of_accounts c ON c.code=l.account_code WHERE c.type='Asset'"))[0].amount);}
for(const [endpoint,type] of [['revenue','Revenue'],['expense','Expense']])
  test('FIN-001 '+endpoint+' persists exact cent-balanced journal with configured accounts',async({audit})=>{
    const cat=await category(audit);const r=await audit.api('POST','finance/'+endpoint,{date:audit.DATE,description:'Audit '+endpoint,amount:123.45,payment_mode:'Cash',category_id:cat.id});expect(r.status).toBe(200);
    const fetched=await audit.api('GET','finance/journal/'+r.body.journal_entry_id);expect(fetched.status).toBe(200);expect(fetched.body.reference_type).toBe(type);
    const actual=fetched.body.lines.map(l=>({account:l.account_code,debit:Number(l.debit),credit:Number(l.credit)})).sort((a,b)=>a.account-b.account);
    expect(actual).toEqual((endpoint==='revenue'?[{account:1000,debit:123.45,credit:0},{account:4000,debit:0,credit:123.45}]:[{account:1000,debit:0,credit:123.45},{account:cat.account_code,debit:123.45,credit:0}]).sort((a,b)=>a.account-b.account));
  });
test('FIN-002 invalid mapping and a failure during ledger insertion roll back the header',async({audit})=>{
  const before=await snapshot(audit);expect.soft((await audit.api('POST','finance/revenue',{amount:100,description:'Invalid',payment_mode:'invalid'})).status).toBe(400);expect(await snapshot(audit)).toEqual(before);
  await failWrite(audit,'ledger_lines');const r=await audit.api('POST','finance/revenue',{amount:100,description:'Injected',payment_mode:'Cash'});expect(r.status).toBe(500);expect(await snapshot(audit)).toEqual(before);
});
for(const [mode,payment,account] of [['Cash','Cash',1000],['Bank','Bank',1010],['Bank_Cash','Bank_Cash',1030]])
  test('TRACK-001 '+mode+' tracker cash and GL accounts reconcile without false revenue',async({audit})=>{
    const r=await tracker(audit,{mode,payment_method:payment});expect(r.status).toBe(201);
    const rows=await audit.rows('SELECT account_code,debit,credit FROM ledger_lines ORDER BY account_code');
    audit.check('Tracker ledger',rows);
    if(mode==='Bank_Cash')expect(rows.map(l=>({account:l.account_code,debit:Number(l.debit),credit:Number(l.credit)}))).toEqual([{account:1000,debit:0,credit:100},{account:1030,debit:100,credit:0}]);
    else expect(rows.find(l=>Number(l.debit)===100)?.account_code).toBe(account);
  });
test('TRACK-002 amount/date/mode corrections and deletion never leave stale journals',async({audit})=>{
  const created=await tracker(audit);expect(created.status).toBe(201);
  expect((await audit.api('PUT','finance/tracker/transaction/'+created.body.id,{amount:200,date:'2026-11-10',mode:'Bank',payment_method:'Bank'})).status).toBe(200);
  const total=await audit.rows("SELECT sum(l.credit-l.debit) AS revenue FROM ledger_lines l WHERE account_code=4000");expect.soft(Number(total[0].revenue)).toBe(200);
  expect.soft((await audit.rows('SELECT mode FROM transactions'))[0].mode).toBe('Bank');
  expect((await audit.api('DELETE','finance/tracker/transaction/'+created.body.id)).status).toBe(200);
  expect(Number((await audit.rows('SELECT COALESCE(sum(credit-debit),0) AS amount FROM ledger_lines WHERE account_code=4000'))[0].amount)).toBe(0);
});
test('TRACK-003 repeated paid status and paid-to-pending keep vendor liability and GL consistent',async({audit})=>{
  const r=await tracker(audit,{type:'Expense',vendor_id:1,status:'Pending'});expect(r.status).toBe(201);
  for(let n=0;n<2;n++)expect((await audit.api('PUT','finance/tracker/transaction/'+r.body.id,{status:'Paid'})).status).toBe(200);
  expect.soft(await audit.rows('SELECT id FROM vendor_payments')).toHaveLength(1);
  expect((await audit.api('PUT','finance/tracker/transaction/'+r.body.id,{status:'Pending'})).status).toBe(200);
  const [state]=await audit.rows("SELECT COALESCE(sum(CASE WHEN transaction_type='Bill' THEN amount ELSE -amount END),0) AS amount FROM vendor_ledger WHERE supplier_id=1");
  expect(Number(state.amount)).toBe(100);
});
test('TRACK-004 locked-period journal failure leaves no successful partial tracker write',async({audit})=>{
  await audit.pool.query("INSERT INTO financial_periods(name,start_date,end_date,status) VALUES('Audit November','2026-11-01','2026-11-30','Locked')");const before=await snapshot(audit);
  expect.soft((await tracker(audit)).status).toBe(400);expect(await snapshot(audit)).toEqual(before);
});
test('TRACK-005 denomination counts reject negative fractional values in the tracker',async({audit,page})=>{
  await audit.session(page);await page.goto('/finance/daily-tracker');
  await page.getByRole('button',{name:'Cash Calculator',exact:true}).click();
  const counts=page.locator('input[type=number][placeholder="0"]');expect(await counts.count()).toBe(9);
  await counts.first().fill('2');await counts.nth(1).fill('3');await expect(page.getByText('₹1600',{exact:true})).toBeVisible();
  await counts.first().fill('-1');expect.soft(await counts.first().evaluate(e=>e.validity.valid)).toBe(false);
  await counts.first().fill('0.5');expect(await counts.first().evaluate(e=>e.validity.valid)).toBe(false);
});
test('MAP-001 mapping history changes only matching expense records and preserves sales',async({audit})=>{
  const cat=await category(audit);await tracker(audit,{description:'Audit rice sale'});await tracker(audit,{type:'Expense',description:'Audit rice purchase'});
  const mapping=await audit.api('POST','finance/mappings',{item_keyword:'rice',category_id:cat.id});expect(mapping.status).toBe(200);
  expect((await audit.api('POST','finance/mappings/'+mapping.body.id+'/apply',{})).status).toBe(200);
  const records=await audit.rows('SELECT type,category_id FROM transactions');expect.soft(records.find(r=>r.type==='Sales').category_id).toBeNull();expect(records.find(r=>r.type==='Expense').category_id).toBe(cat.id);
  expect((await audit.api('DELETE','finance/mappings/'+mapping.body.id)).status).toBe(200);
});
test('MAP-002 applying mappings cannot rewrite a closed day',async({audit})=>{
  const cat=await category(audit);await tracker(audit,{type:'Expense'});await balance(audit);expect((await close(audit)).status).toBe(200);
  const mapping=await audit.api('POST','finance/mappings',{item_keyword:'Audit',category_id:cat.id});expect(mapping.status).toBe(200);const before=await snapshot(audit);
  expect.soft((await audit.api('POST','finance/mappings/'+mapping.body.id+'/apply',{})).status).toBe(409);expect(await snapshot(audit)).toEqual(before);
});
for(const mode of ['Cash','Bank','UPI','Card'])
  test('TRANSFER-001 '+mode+' wallet round trip conserves total assets',async({audit})=>{
    const initial=await conserved(audit);for(const [endpoint,key] of [['safe-to-user','toUserId'],['user-to-safe','fromUserId']])expect((await audit.api('POST','finance/transfer/'+endpoint,{[key]:3,amount:123.45,mode,description:'Round trip'})).status).toBe(200);
    expect(await conserved(audit)).toBe(initial);expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1071'))[0].balance)).toBe(0);
  });
test('TRANSFER-002 missing wallet, nonfinite amount and same-account transfers are rejected atomically',async({audit})=>{
  await audit.pool.query('UPDATE users SET ledger_account_code=1000 WHERE id=1');const before=await snapshot(audit);
  for(const body of [{toUserId:999,amount:10},{toUserId:1,amount:10},{toUserId:3,amount:'NaN'}])expect.soft((await audit.api('POST','finance/transfer/safe-to-user',{mode:'Cash',description:'Invalid',...body})).status).toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
test('TRANSFER-003 concurrent wallet returns preserve signed balance and overdraft history',async({audit})=>{
  await seedJournal(audit,{lines:[[1071,100,0],[3009,0,100]]});const replies=await Promise.all([1,2].map(()=>audit.api('POST','finance/transfer/user-to-safe',{fromUserId:3,amount:60,mode:'Cash'})));
  expect(replies.map(r=>r.status)).toEqual([200,200]);expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1071'))[0].balance)).toBe(-20);
  const history=await audit.api('GET','finance/transfer/history');expect(history.status).toBe(200);
  expect(history.body.wallets.find(w=>w.id===3).overdraft).toBe('20.00');
  expect(history.body.history.filter(h=>h.user_id===3).map(h=>[Number(h.balance_before),Number(h.balance_after)])).toEqual([[40,-20],[100,40]]);
});
test('TRANSFER-004 employee advance and repayment reconcile receivable, ledger and cash',async({audit})=>{
  for(const [endpoint,key,amount] of [['safe-to-user','toUserId',1000],['user-to-safe','fromUserId',400]])expect((await audit.api('POST','finance/transfer/'+endpoint,{[key]:1,targetType:'employee',amount,mode:'Cash'})).status).toBe(200);
  expect((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(600);
  expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1100'))[0].balance)).toBe(600);
});
test('CLOSE-001 default schema supports a cash variance without missing accounts',async({audit})=>{
  await balance(audit);expect((await close(audit,10)).status).toBe(200);
});
for(const actual of [0,90,100,110])
  test('CLOSE-001 actual '+actual+' reports exact variance and carry-forward',async({audit})=>{
    await varianceAccounts(audit);await seedJournal(audit,{lines:[[1000,100,0],[3009,0,100]]});await balance(audit);await balance(audit);const r=await close(audit,actual);expect(r.status).toBe(200);expect(r.body.variance).toBe(actual-100);
    const after=await balance(audit);expect.soft(Number(after.body.variance)).toBe(actual-100);
    expect(Number((await audit.rows("SELECT opening_balance FROM daily_balances WHERE date='2026-11-10' AND account_code=1000"))[0].opening_balance)).toBe(actual);
  });
test('CLOSE-001 first summary includes journal movements with time on the selected day',async({audit})=>{
  await seedJournal(audit,{date:audit.DATE+'T12:00:00Z',lines:[[1000,100,0],[3009,0,100]]});expect.soft(Number((await balance(audit)).body.closing_balance)).toBe(100);expect(Number((await balance(audit)).body.closing_balance)).toBe(100);
});
test('CLOSE-002 concurrent close produces one closure and uninitialized close fails without changes',async({audit})=>{
  const before=await snapshot(audit,['daily_balances','journal_entries','ledger_lines']);expect.soft((await close(audit)).status).toBe(400);expect(await snapshot(audit,['daily_balances','journal_entries','ledger_lines'])).toEqual(before);
  await balance(audit);const replies=await Promise.all([close(audit),close(audit)]);expect(replies.map(r=>r.status).sort()).toEqual([200,400]);
});
for(const operation of ['revenue','tracker-add','tracker-edit','tracker-delete'])
  test('CLOSE-003 closed-day '+operation+' is blocked atomically',async({audit})=>{
    const r=await tracker(audit);expect(r.status).toBe(201);await balance(audit);expect((await close(audit)).status).toBe(200);const before=await snapshot(audit);
    const reply=operation==='revenue'?await audit.api('POST','finance/revenue',{date:audit.DATE,description:'Closed',amount:100,payment_mode:'Cash'}):operation==='tracker-add'?await tracker(audit):await audit.api(operation==='tracker-edit'?'PUT':'DELETE','finance/tracker/transaction/'+r.body.id,operation==='tracker-edit'?{amount:200}:undefined);
    expect.soft(reply.status).toBe(409);expect(await snapshot(audit)).toEqual(before);
  });
test('CLOSE-004 owner reason and single reopen are enforced with role denial',async({audit})=>{
  await balance(audit);expect((await close(audit)).status).toBe(200);for(const role of ['manager','staff'])expect((await reopen(audit,role)).status).toBe(403);
  expect.soft((await reopen(audit,'owner',{reason:''})).status).toBe(400);
  const r=await reopen(audit);audit.check('Reason/reopen responses',r.body);expect.soft(r.status).toBe(200);
  expect((await audit.rows('SELECT reopen_count FROM daily_balances WHERE date=$1',[audit.DATE]))[0].reopen_count).toBe(1);
});
test('CLOSE-005 audit insertion failure rolls back variance reversal and closed state together',async({audit})=>{
  await varianceAccounts(audit);await balance(audit);expect((await close(audit,10)).status).toBe(200);await failWrite(audit,'audit_logs');const before=await snapshot(audit,['daily_balances','journal_entries','ledger_lines']);
  expect((await reopen(audit)).status).toBe(500);expect(await snapshot(audit,['daily_balances','journal_entries','ledger_lines'])).toEqual(before);
});
test('CLOSE-006 reopening one account preserves a second account with the same type/date',async({audit})=>{
  // Fixtures isolate reopen scoping from the API's ignored accountCode parameter.
  await audit.pool.query("INSERT INTO daily_balances(date,type,account_code,status) VALUES($1,'Counter',1000,'Closed'),($1,'Counter',1071,'Closed')",[audit.DATE]);
  expect((await reopen(audit,'owner',{accountCode:1071})).status).toBe(200);
  expect((await audit.rows('SELECT status FROM daily_balances WHERE date=$1 AND account_code=1000',[audit.DATE]))[0].status).toBe('Closed');
});
test('CLOSE-006 custom account summary and close honor the requested wallet account',async({audit})=>{
  const r=await balance(audit,audit.DATE,'Counter',1071);expect.soft(Number(r.body.account_code)).toBe(1071);
  expect((await close(audit,0,'Counter',audit.DATE,1071)).status).toBe(200);
  expect((await audit.rows('SELECT status FROM daily_balances WHERE date=$1 AND account_code=1071',[audit.DATE]))[0]?.status).toBe('Closed');
});
test('CLOSE-007 December close never overwrites an already closed January opening',async({audit})=>{
  await audit.pool.query("INSERT INTO daily_balances(date,type,account_code,opening_balance,closing_balance,actual_closing_balance,status) VALUES('2026-12-31','Counter',1000,0,10,NULL,'Open'),('2027-01-01','Counter',1000,99,99,99,'Closed')");
  const before=await audit.rows("SELECT * FROM daily_balances WHERE date='2027-01-01'");expect((await close(audit,10,'Counter','2026-12-31')).status).toBe(200);expect(await audit.rows("SELECT * FROM daily_balances WHERE date='2027-01-01'")).toEqual(before);
});
test('GL-001 each journal has balanced cents, source references and at least two valid lines',async({audit})=>{
  expect((await tracker(audit)).status).toBe(201);
  const rows=await audit.rows("SELECT j.id,j.reference_type,j.reference_id,count(l.id)::int AS lines,COALESCE(sum(l.debit-l.credit),0) AS imbalance FROM journal_entries j LEFT JOIN ledger_lines l ON j.id=l.journal_entry_id GROUP BY j.id");
  expect(rows.length).toBeGreaterThan(0);for(const r of rows){expect.soft(r.lines).toBeGreaterThanOrEqual(2);expect.soft(Number(r.imbalance)).toBe(0);expect.soft(r.reference_type).not.toBeNull();expect.soft(r.reference_id).not.toBeNull();}
});
for(const [name,changes] of [['NaN',{lines:[{account_code:1000,debit:'NaN'},{account_code:4000,credit:1}]}],['Infinity',{lines:[{account_code:1000,debit:'Infinity'},{account_code:4000,credit:'Infinity'}]}],['invalid date',{date:'garbage'}],['same account',{lines:[{account_code:1000,debit:1},{account_code:1000,credit:1}]}],['cent imbalance',{lines:[{account_code:1000,debit:1},{account_code:4000,credit:1.01}]}]])
  test('GL-002 '+name+' rejected by journal entity/service without persistence',async({audit})=>{
    const before=await snapshot(audit);const r=await audit.service('JournalService','createJournalEntry',{date:audit.DATE,description:'Invalid',reference_type:'Audit',reference_id:'invalid',lines:[{account_code:1000,debit:1},{account_code:4000,credit:1}],...changes});
    expect.soft(r.ok).toBe(false);expect(await snapshot(audit)).toEqual(before);
  });
test('GL-003 signed balances include equity and zero activity before an as-of cutoff',async({audit})=>{
  await seedJournal(audit,{date:'2026-11-10',lines:[[1000,100,0],[3009,0,100]]});
  for(const [code,date,expected] of [[3009,null,100],[1000,'2026-11-09',0],[1030,'2026-11-09',0]]){const r=await audit.api('GET','finance/account-balance/'+code+(date?'?asOfDate='+date:''));expect.soft(r.status).toBe(200);expect.soft(r.body.balance).toBe(expected);}
});
test('GL-004 repeated reversal is idempotent and locked reversal leaves originals immutable',async({audit})=>{
  const id=await seedJournal(audit,{lines:[[1000,100,0],[4000,0,100]]});const original=await audit.rows('SELECT * FROM journal_entries WHERE id=$1',[id]);
  expect((await audit.service('JournalService','reverseJournalEntry',id,'First',audit.DATE)).ok).toBe(true);
  await audit.service('JournalService','reverseJournalEntry',id,'Repeat',audit.DATE);expect.soft(await audit.rows("SELECT id FROM journal_entries WHERE reference_type='Reversal'")).toHaveLength(1);
  await audit.pool.query("INSERT INTO financial_periods(name,start_date,end_date,status) VALUES('Audit November','2026-11-01','2026-11-30','Locked')");const before=await snapshot(audit);expect((await audit.service('JournalService','reverseJournalEntry',id,'Locked',audit.DATE)).ok).toBe(false);expect(await snapshot(audit)).toEqual(before);expect(await audit.rows('SELECT * FROM journal_entries WHERE id=$1',[id])).toEqual(original);
});
