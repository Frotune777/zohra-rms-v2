const { integration } = require('./helpers/integration');
const ctx = integration();
const service = () => require('../src/modules/finance/TransferService');

describe('Wallet and employee transfers: persisted conservation and rejected writes', () => {
  test.each([['Cash',1000],['Bank Transfer',1010],['UPI',1020]])('funds a wallet via %s with exact journal and actor history', async (mode, account) => {
    const result = await service().transferSafeToUser(ctx.actors.staff.id,75,'Travel float',ctx.actors.manager.id,mode);
    await ctx.journal('Transfer',ctx.actors.manager.id,[{account:1071,debit:75,credit:0},{account,debit:0,credit:75}]);
    expect(await ctx.balance(1071)).toBe(75);
    expect(await ctx.balance(account)).toBe(-75);
    const {wallets,history} = await service().getWalletHistory();
    expect(wallets.find(w=>w.id===ctx.actors.staff.id)).toMatchObject({balance:'75.00',overdraft:'0'});
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({journal_entry_id:result.id,user_id:ctx.actors.staff.id,performed_by:ctx.actors.manager.id,direction:'In',amount:'75.00',balance_before:'0.00',balance_after:'75.00',description:'Travel float'});
  });
  test('wallet return can cross zero and records signed before/after balances', async () => {
    await service().transferSafeToUser(ctx.actors.staff.id,75,undefined,ctx.actors.owner.id);
    await service().transferUserToSafe(ctx.actors.staff.id,100,undefined,ctx.actors.manager.id);
    const {wallets,history} = await service().getWalletHistory();
    expect(wallets.find(w=>w.id===ctx.actors.staff.id)).toMatchObject({balance:'-25.00',overdraft:'25.00'});
    expect(history[0]).toMatchObject({direction:'Out',amount:'100.00',balance_before:'75.00',balance_after:'-25.00',description:'Return via Cash'});
    expect(await ctx.balance(1000)).toBe(25);
  });
  test('owner Equity transfers are excluded from employee overdraft/history summaries', async () => {
    await service().transferSafeToUser(ctx.actors.owner.id,20,'Owner allocation',ctx.actors.owner.id);
    expect(await ctx.balance(3009)).toBe(20);
    const result = await service().getWalletHistory();
    expect(result.wallets.map(w=>w.id)).not.toContain(ctx.actors.owner.id);
    expect(result.history).toEqual([]);
  });
  test.each([0,-1,null,undefined,'',NaN,Infinity,'not money'])('rejects invalid transfer amount %p without any writes', async amount => {
    const before=await ctx.snapshot();
    await expect(service().transferSafeToUser(ctx.actors.staff.id,amount,'Invalid',ctx.actors.owner.id)).rejects.toThrow('Transfer amount');
    expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([0,999])('rejects missing wallet user %i', async id => {
    const before=await ctx.snapshot();
    await expect(service().getLedgerCodeForUser(id)).rejects.toThrow('linked wallet');
    expect(await ctx.snapshot()).toEqual(before);
  });
  test('rejects an existing user with no linked wallet', async () => {
    await ctx.pool.query('UPDATE users SET ledger_account_code=NULL WHERE id=$1',[ctx.actors.staff.id]);
    await expect(service().getLedgerCodeForUser(ctx.actors.staff.id)).rejects.toThrow('linked wallet');
  });
  test.each(['Locked','Closed'])('a %s period rejects transfers before a journal or history write', async status => {
    await ctx.closedPeriod(status);const before=await ctx.snapshot();
    await expect(service().transferSafeToUser(ctx.actors.staff.id,10,'Blocked',ctx.actors.owner.id)).rejects.toThrow('locked');
    expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([[1000,1000],[99999,1071]])('invalid account pair %p rolls back completely', async(from,to)=>{
    const before=await ctx.snapshot();
    await expect(service().executeTransfer(from,to,10,'Invalid pair',ctx.actors.owner.id)).rejects.toThrow();
    expect(await ctx.snapshot()).toEqual(before);
  });
  test('a late wallet-history failure rolls back already inserted journal lines', async()=>{
    await ctx.failOn('wallet_transfer_history');const before=await ctx.snapshot();
    await expect(service().transferSafeToUser(ctx.actors.staff.id,25,'Fault',ctx.actors.owner.id)).rejects.toThrow('Jest forced failure');
    expect(await ctx.snapshot()).toEqual(before);
  });
  test('sub-cent input reconciles history and actual account balance', async()=>{
    await service().transferSafeToUser(ctx.actors.staff.id,1.005,'Cent boundary',ctx.actors.owner.id);
    const {history}=await service().getWalletHistory();const balance=await ctx.balance(1071);
    expect(Number(history[0].amount)).toBe(balance);
    expect(Number(history[0].balance_after)).toBe(balance);
  });
  test('direct employee advance and repayment preserve FIFO and actual debt',async()=>{
    await service().transferSafeToEmployee(1,125,undefined,ctx.actors.owner.id,'Bank Transfer');
    expect(await ctx.balance(1100)).toBe(125);
    expect(await ctx.balance(1010)).toBe(-125);
    await service().transferEmployeeToSafe(1,25,undefined,ctx.actors.manager.id,'Cash');
    expect(await ctx.balance(1100)).toBe(100);expect(await ctx.balance(1000)).toBe(25);
    expect(await ctx.rows('SELECT balance_remaining,total_repaid FROM salary_advances WHERE employee_id=1')).toEqual([{balance_remaining:'100.00',total_repaid:'25.00'}]);
    expect(await ctx.rows('SELECT status FROM advance_requests ORDER BY id')).toEqual([{status:'Approved'},{status:'Approved'}]);
    const before=await ctx.snapshot();
    await expect(service().transferEmployeeToSafe(1,100.01,'Too much',ctx.actors.owner.id)).rejects.toThrow('outstanding');
    expect(await ctx.snapshot()).toEqual(before);
  });
  test('failed direct advance approval rolls back the newly created request too',async()=>{
    await ctx.failOn('salary_advances');const before=await ctx.snapshot();
    await expect(service().transferSafeToEmployee(1,100,'Fault',ctx.actors.owner.id)).rejects.toThrow('Jest forced failure');
    expect(await ctx.snapshot()).toEqual(before);
  });
  test('failed direct repayment restores the original debt and request set',async()=>{
    await service().transferSafeToEmployee(1,100,'Loan',ctx.actors.owner.id);
    await ctx.failOn('advance_ledger','INSERT',"NEW.transaction_type='Repayment'");const before=await ctx.snapshot();
    await expect(service().transferEmployeeToSafe(1,40,'Fault',ctx.actors.owner.id)).rejects.toThrow('Jest forced failure');
    expect(await ctx.snapshot()).toEqual(before);
  });
});
