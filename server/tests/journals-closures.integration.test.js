const {randomUUID}=require('node:crypto');
const {integration}=require('./helpers/integration');
const JournalEntry=require('../src/modules/finance/entities/JournalEntry');
const ctx=integration();
const journals=()=>require('../src/modules/finance/JournalService');
const modes=()=>require('../src/modules/finance/PaymentModeService');
const entry=(patch={})=>({date:'2026-11-09T12:00:00Z',description:'Jest receipt',reference_type:'JestJournal',reference_id:'source',lines:[{account_code:1000,debit:80},{account_code:4000,credit:80}],...patch});
const close=(amount=80,patch={})=>ctx.api('POST','finance/daily-balance/close',{date:'2026-11-09',type:'Counter',actualClosingBalance:amount,...patch});
const reopen=(patch={},role='owner')=>ctx.api('POST','finance/daily-balance/reopen',{date:'2026-11-09',type:'Counter',reason:'Recount',...patch},role);
describe('Journals: immutable postings, cutoff, account sign and transaction ownership',()=>{
  test('raw/prebuilt journals report signed accounts and include the whole cutoff day',async()=>{
    const first=await journals().createJournalEntry(new JournalEntry(entry()));await journals().createJournalEntry(entry({date:'2026-11-10T12:00:00Z',reference_id:'later'}));
    await ctx.journal('JestJournal','source',[{account:1000,debit:80,credit:0},{account:4000,debit:0,credit:80}]);
    expect(await journals().getAccountBalance(1000,'2026-11-08')).toBe(0);expect(await journals().getAccountBalance(1000,'2026-11-09')).toBe(80);expect(await journals().getAccountBalance(1000)).toBe(160);expect(await journals().getAccountBalance(4000)).toBe(160);expect(await journals().getAccountBalance(6000)).toBe(0);
    const result=await ctx.api('GET','finance/journal/'+first.id);expect(result.status).toBe(200);expect(result.body.lines.map(l=>[l.account_code,l.debit,l.credit]).sort((a,b)=>a[0]-b[0])).toEqual([[1000,'80.00','0.00'],[4000,'0.00','80.00']]);
    expect((await ctx.api('GET','finance/account-balance/1000?asOfDate=2026-11-09')).body).toEqual({account_code:'1000',balance:80});
    const before=await ctx.snapshot();expect((await ctx.api('GET','finance/journal/'+randomUUID())).status).toBe(404);await expect(journals().getAccountBalance(99999)).rejects.toThrow('not found');await expect(journals().createJournalEntry(entry({lines:[{account_code:99999,debit:80},{account_code:4000,credit:80}]}))).rejects.toThrow('Invalid account code');expect(await ctx.snapshot()).toEqual(before);
  });
  test('reversal uses exact original lines; replay never creates another reversal',async()=>{
    const original=await journals().createJournalEntry(entry());const first=await journals().reverseJournalEntry(original.id,'Correction','2026-11-09');
    await ctx.journal('Reversal',original.id,[{account:1000,debit:0,credit:80},{account:4000,debit:80,credit:0}]);expect(await journals().getAccountBalance(1000)).toBe(0);
    const before=await ctx.snapshot();expect((await journals().reverseJournalEntry(original.id,'Correction','2026-11-09')).id).toBe(first.id);expect(await ctx.snapshot()).toEqual(before);await expect(journals().reverseJournalEntry(randomUUID(),'Missing')).rejects.toThrow('not found');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['own','caller'])('%s transaction rolls back a failure after the first ledger line',async ownership=>{
    await ctx.failOn('ledger_lines','INSERT','NEW.account_code=4000');const before=await ctx.snapshot();
    const action=ownership==='own'?journals().createJournalEntry(entry()):ctx.transaction(c=>journals().createJournalEntry(entry(),c));await expect(action).rejects.toThrow('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test('caller can read uncommitted journal and roll back both create and reversal',async()=>{
    const before=await ctx.snapshot();await expect(ctx.transaction(async c=>{const original=await journals().createJournalEntry(entry(),c);expect((await journals().getJournalEntry(original.id,c)).lines).toHaveLength(2);await journals().reverseJournalEntry(original.id,'Wrong source','2026-11-09',c);throw new Error('Caller aborted');})).rejects.toThrow('Caller aborted');expect(await ctx.snapshot()).toEqual(before);
  });
  test('PnL excludes asset transfers, includes reversals, fills empty months and applies filters',async()=>{
    const revenue=await journals().createJournalEntry(entry());await journals().createJournalEntry(entry({reference_id:'cost',lines:[{account_code:6000,debit:20},{account_code:1000,credit:20}]}));await journals().createJournalEntry(entry({reference_id:'transfer',lines:[{account_code:1010,debit:30},{account_code:1000,credit:30}]}));
    expect((await ctx.api('GET','finance/pnl?month=11&year=2026')).body).toEqual({month:11,year:2026,revenue:80,expenses:20,profit:60});expect((await ctx.api('GET','finance/pnl')).body.profit).toBe(60);
    await journals().reverseJournalEntry(revenue.id,'Correction','2026-11-09');const annual=await ctx.api('GET','finance/pnl/yearly?year=2026');expect(annual.status).toBe(200);expect(annual.body).toHaveLength(12);expect(annual.body[10]).toEqual({month:11,year:2026,revenue:0,expenses:20,profit:-20});expect(annual.body[0]).toEqual({month:1,year:2026,revenue:0,expenses:0,profit:0});
    expect((await ctx.api('GET','finance/transactions?startDate=2026-11-10&endDate=2026-11-11')).body).toEqual([]);expect((await ctx.api('GET','finance/transactions')).body).toHaveLength(4);
    const before=await ctx.snapshot();expect((await ctx.api('DELETE','finance/transaction/'+revenue.id)).status).toBe(409);expect((await ctx.api('DELETE','finance/transaction/'+randomUUID())).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
  });
});
describe('Payment mode configuration validates active aliases and required references',()=>{
  test('active mode detail/account/list reflect configuration and bank display alias',async()=>{
    expect(await modes().getAccountCode('Bank Transfer')).toBe(1010);expect(await modes().getAccountCode('cAsH')).toBe(1000);expect(await modes().getPaymentMode('Cash')).toMatchObject({account_code:1000,account_type:'Asset'});expect(await modes().validatePayment('Cash')).toBe(true);
    expect((await ctx.api('GET','finance/payment-modes')).body.map(m=>m.name)).toContain('cash');await ctx.pool.query("UPDATE payment_modes SET requires_reference=TRUE WHERE LOWER(name)='bank'");
    await expect(modes().validatePayment('Bank')).rejects.toThrow('requires a reference');expect(await modes().validatePayment('Bank','Receipt')).toBe(true);
  });
  test('inactive and unknown payment modes reject and disappear from active listings',async()=>{
    await ctx.pool.query("UPDATE payment_modes SET is_active=FALSE WHERE LOWER(name)='cash'");const before=await ctx.snapshot();await expect(modes().getAccountCode('Cash')).rejects.toThrow('inactive');await expect(modes().getPaymentMode('Unknown')).rejects.toThrow('inactive');expect((await modes().getAllPaymentModes()).map(m=>m.name)).not.toContain('cash');expect(await ctx.snapshot()).toEqual(before);
  });
});
describe('Daily closure: variance, immutable expected balance and exact reopen rollback',()=>{
  test.each([[70,7000],[90,7100],[80,null]])('closing at %i posts only expected variance to account %p',async(actual,varianceAccount)=>{
    await journals().createJournalEntry(entry());const initial=await ctx.api('GET','finance/daily-balance/2026-11-09');expect(initial.status).toBe(200);expect(initial.body.closing_balance).toBe(80);
    const result=await close(actual);expect(result.status).toBe(200);expect(result.body).toMatchObject({expected_closing:80,actual_closing:actual,variance:actual-80,variance_posted:!!varianceAccount});
    const source=(await ctx.rows("SELECT id,closed_by,closing_balance FROM daily_balances WHERE date='2026-11-09'"))[0];expect(source.closed_by).toBe(ctx.actors.owner.id);expect(source.closing_balance).toBe('80.00');
    if(varianceAccount)await ctx.journal('CashVariance',source.id,actual<80?[{account:7000,debit:10,credit:0},{account:1000,debit:0,credit:10}]:[{account:1000,debit:10,credit:0},{account:7100,debit:0,credit:10}]);
    expect((await ctx.api('GET','finance/daily-balance/2026-11-09')).body).toMatchObject({closing_balance:80,expected_closing_calculated:80,variance:actual-80});expect(await ctx.rows("SELECT opening_balance FROM daily_balances WHERE date='2026-11-10'")).toEqual([{opening_balance:actual.toFixed(2)}]);
    let before=await ctx.snapshot();expect((await close(actual)).status).toBe(400);expect((await reopen({},'manager')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
    expect((await reopen()).status).toBe(200);expect(await ctx.balance(1000)).toBe(80);expect(await ctx.rows("SELECT status,reopen_count,closed_by FROM daily_balances WHERE date='2026-11-09'")).toEqual([{status:'Open',reopen_count:1,closed_by:null}]);
    before=await ctx.snapshot();expect((await reopen()).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([{date:undefined},{type:undefined},{actualClosingBalance:undefined},{actualClosingBalance:'bad'}])('incomplete close %p and incomplete reopen reject without changes',async patch=>{
    const before=await ctx.snapshot();expect((await close(0,patch)).status).toBe(400);expect((await reopen({reason:''})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('account-specific closure blocks only that account and financial periods block all accounts',async()=>{
    await ctx.api('GET','finance/daily-balance/2026-11-09?type=Float&accountCode=1071');expect((await close(0,{type:'Float',accountCode:1071})).status).toBe(200);
    await expect(journals().createJournalEntry(entry({lines:[{account_code:1071,debit:80},{account_code:4000,credit:80}]}))).rejects.toThrow('day is closed');expect((await journals().createJournalEntry(entry())).id).toBeTruthy();
    await ctx.closedPeriod('Locked');const before=await ctx.snapshot();await expect(journals().createJournalEntry(entry({reference_id:'blocked'}))).rejects.toThrow('period is locked');expect((await reopen({type:'Float',accountCode:1071})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('next-day insertion failure restores variance posting and current closure',async()=>{
    await journals().createJournalEntry(entry());await ctx.api('GET','finance/daily-balance/2026-11-09');await ctx.failOn('daily_balances','INSERT',"NEW.date='2026-11-10'");const before=await ctx.snapshot();
    const result=await close(70);expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test('reopen audit failure rolls back variance reversal and all closure metadata',async()=>{
    await journals().createJournalEntry(entry());await ctx.api('GET','finance/daily-balance/2026-11-09');await close(70);await ctx.failOn('audit_logs');const before=await ctx.snapshot();
    const result=await reopen();expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
});
