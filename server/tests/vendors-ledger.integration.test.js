const {integration}=require('./helpers/integration');
const ctx=integration();
const ledger=()=>require('../src/modules/vendors/ledger.service');
const payment=(patch={},role='owner')=>ctx.api('POST','vendors/payments',{vendorId:1,amount:25,paymentMode:'Cash',paidBy:'Jest owner',reference:'Jest receipt',...patch},role);
async function debt(){await ctx.pool.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount,details) VALUES(1,CURRENT_DATE,'Bill',200,'Jest payable')");}

describe('Vendor ledger aggregates and chronological boundaries',()=>{
  test('running ledger includes opening and pre-range activity and subtracts either payment sign',async()=>{
    await ctx.pool.query('UPDATE suppliers SET opening_balance=50 WHERE id=1');
    await ctx.pool.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount) VALUES(1,'2026-11-08','Bill',100),(1,'2026-11-09','Payment',-20),(1,'2026-11-10','Purchase',20)");
    const all=await ledger().calculateRunningBalance(1);expect(all.opening_balance).toBe(50);expect(all.transactions.map(t=>t.running_balance)).toEqual([150,130,150]);expect(all.closing_balance).toBe(150);
    const ranged=await ledger().calculateRunningBalance(1,'2026-11-09','2026-11-10');expect(ranged.opening_balance).toBe(150);expect(ranged.transactions.map(t=>t.running_balance)).toEqual([130,150]);
    expect((await ledger().calculateRunningBalance(1,null,'2026-11-09')).closing_balance).toBe(130);
    expect(await ledger().getOutstandingAmount(1)).toMatchObject({opening_balance:50,total_transactions:100,outstanding_amount:150});
    expect((await ledger().getDateRangeReport('2026-11-09','2026-11-10')).totals).toEqual({total_bills:20,total_payments:20,net_outstanding:0,transaction_count:2});
  });
  test('category aggregation counts each supplier opening once despite multiple ledger rows',async()=>{
    const category=(await ctx.pool.query("INSERT INTO vendor_categories(name) VALUES('Jest category') RETURNING id")).rows[0];
    await ctx.pool.query('UPDATE suppliers SET category_id=$1,opening_balance=CASE id WHEN 1 THEN 50 ELSE 10 END',[category.id]);
    await ctx.pool.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount) VALUES(1,'2026-11-09','Bill',100),(1,'2026-11-09','Purchase',20),(1,'2026-11-09','Payment',20),(2,'2026-11-09','Bill',7),(2,'2026-11-09','Payment',2)");
    expect(await ledger().getCategoryAggregation(category.id,'2026-11-09','2026-11-09')).toEqual([{category_id:category.id,category_name:'Jest category',vendor_count:2,total_opening_balance:60,total_transactions:105,outstanding_balance:165}]);
    expect((await ledger().getDateRangeReport('2026-11-09','2026-11-09',category.id)).totals).toEqual({total_bills:127,total_payments:22,net_outstanding:105,transaction_count:5});
    expect(await ledger().getCategoryAggregation(category.id,'2026-11-10','2026-11-10')).toEqual([{category_id:category.id,category_name:'Jest category',vendor_count:2,total_opening_balance:60,total_transactions:0,outstanding_balance:60}]);
  });
  test('empty reports retain zero totals and opening-only debt',async()=>{
    expect(await ledger().getPaymentHistory()).toEqual({payments:[],summary:{total_payments:0,total_amount:0,by_mode:{}}});
    expect((await ledger().getDateRangeReport('2026-11-01','2026-11-30')).totals).toEqual({total_bills:0,total_payments:0,net_outstanding:0,transaction_count:0});
    expect(await ledger().getAgingReport()).toEqual([]);
    expect((await ledger().calculateRunningBalance(99999)).closing_balance).toBe(0);
    await expect(ledger().getOutstandingAmount(99999)).rejects.toThrow('Vendor not found');
    await ctx.pool.query('UPDATE suppliers SET opening_balance=20 WHERE id=1');expect((await ledger().getAgingReport())[0]).toMatchObject({days_outstanding:0,aging_category:'0-30 days',outstanding_balance:20});
  });
  test.each([[30,'0-30 days'],[31,'30-60 days'],[60,'30-60 days'],[61,'60-90 days'],[90,'60-90 days'],[91,'>90 days']])('aging at %i days belongs to %s',async(days,bucket)=>{
    await ctx.pool.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount) VALUES(1,CURRENT_DATE-$1::int,'Bill',100)",[days]);
    expect((await ledger().getAgingReport())[0]).toMatchObject({days_outstanding:days,aging_category:bucket,outstanding_balance:100});
  });
  test('payment-history filters and mode totals are independent of other vendors/days',async()=>{
    await ctx.pool.query("INSERT INTO vendor_payments(vendor_id,payment_date,amount,payment_mode,notes,paid_by) VALUES(1,'2026-11-01',10,'Cash','','Jest'),(1,'2026-11-09',20,'Cash','','Jest'),(1,'2026-11-09',30,'Bank','','Jest'),(2,'2026-11-09',40,'Cash','','Jest')");
    expect((await ledger().getPaymentHistory()).summary).toEqual({total_payments:4,total_amount:100,by_mode:{Cash:{count:3,total:70},Bank:{count:1,total:30}}});
    expect((await ledger().getPaymentHistory(1,'2026-11-09','2026-11-09','Cash')).summary).toEqual({total_payments:1,total_amount:20,by_mode:{Cash:{count:1,total:20}}});
    expect((await ledger().getPaymentHistory(null,null,'2026-11-01')).summary.total_amount).toBe(10);
    const api=await ctx.api('GET','vendors/payments?vendorId=1&startDate=2026-11-09&endDate=2026-11-09&paymentMode=Bank');expect(api.status).toBe(200);expect(api.body.map(p=>Number(p.amount))).toEqual([30]);
  });
  test.each([
    ['calculateRunningBalance',[1],'Running balance calculation failed'],['getOutstandingAmount',[1],'Outstanding calculation failed'],
    ['getCategoryAggregation',[],'Category aggregation failed'],['getPaymentHistory',[],'Payment history retrieval failed'],
    ['getDateRangeReport',['2026-11-01','2026-11-30'],'Date range report failed'],['getAgingReport',[],'Aging report failed'],
  ])('%s reports dependency failure with its own context',async(method,args,message)=>{
    const before=await ctx.snapshot();jest.spyOn(ctx.db,'query').mockRejectedValueOnce(new Error('Jest read unavailable'));
    await expect(ledger()[method](...args)).rejects.toThrow(message+': Jest read unavailable');expect(await ctx.snapshot()).toEqual(before);
  });
});

describe('Vendor payment writes, retries and rollback',()=>{
  test.each([['Cash',1000],['UPI',1020],['Bank Transfer',1010],['Card',1010],['Cheque',1010]])('%s payment reconciles vendor debt and exact cash journal',async(mode,account)=>{
    await debt();const result=await payment({paymentMode:mode,paidBy:'  Jest manager  ',notes:null});expect(result.status).toBe(200);
    expect(result.body.payment).toMatchObject({amount:'25.00',notes:'',paid_by:'Jest manager',created_by:null,created_by_user_id:ctx.actors.owner.id});
    expect(result.body.newBalance).toBe(175);await ctx.journal('VendorPayment',result.body.payment.id,[{account:2000,debit:25,credit:0},{account,debit:0,credit:25}]);
    const before=await ctx.snapshot();expect((await payment({paymentMode:mode})).body.payment.id).toBe(result.body.payment.id);expect(await ctx.snapshot()).toEqual(before);
    expect((await payment({paymentMode:mode,amount:26})).status).toBe(409);
  });
  test.each([0,-1,null,'',.001,'invalid'])('invalid payment amount %p creates no payment/ledger/journal',async amount=>{
    await debt();const before=await ctx.snapshot();expect((await payment({amount})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([{amount:201},{vendorId:99999},{paidBy:''},{paidBy:null},{paidBy:' '.repeat(5)},{paidBy:'x'.repeat(101)},{notes:42},{paymentMode:'Invalid'}])('invalid payment %p leaves outstanding unchanged',async patch=>{
    await debt();const before=await ctx.snapshot();const result=await payment(patch);expect(result.status).toBe(patch.vendorId===99999?404:400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['vendor_ledger','ledger_lines','vendor_payments'])('payment failure at %s rolls back all earlier stages',async table=>{
    await debt();await ctx.failOn(table,table==='vendor_payments'?'UPDATE':'INSERT');const before=await ctx.snapshot();
    const result=await payment();expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test('aging detail applies receipts against the oldest debt first',async()=>{
    await ctx.pool.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount) VALUES(1,CURRENT_DATE-91,'Bill',100),(1,CURRENT_DATE-61,'Bill',100),(1,CURRENT_DATE-31,'Bill',100),(1,CURRENT_DATE,'Bill',100),(1,CURRENT_DATE,'Payment',150)");
    const result=await ctx.api('GET','vendors/1/details');expect(result.status).toBe(200);expect(result.body.aging).toEqual({over_90_days:0,'60_90_days':50,'30_60_days':100,'0_30_days':100});
    expect((await ctx.api('GET','vendors/99999/details')).status).toBe(404);expect((await ctx.api('GET','vendors/99999/outstanding')).status).toBe(404);
  });
  test('staff cannot read supplier finances or write payments',async()=>{
    await debt();const before=await ctx.snapshot();
    for(const path of ['vendors/payments','vendors/1/outstanding','vendors/1/details','vendors/1/ledger','vendors/1/running-balance','vendors/reports/category-aggregation','vendors/reports/aging'])expect((await ctx.api('GET',path,undefined,'staff')).status).toBe(403);
    expect((await payment({},'staff')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
  });
});
