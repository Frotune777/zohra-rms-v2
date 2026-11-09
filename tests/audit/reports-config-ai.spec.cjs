const {test,expect}=require('./fixtures.cjs');
const {snapshot,seedJournal,billFixture,order}=require('./helpers.cjs');
const range='?startDate=2026-11-01&endDate=2026-11-30';
async function financialFixture(audit){
  for(const [id,lines] of [['revenue',[[1000,1000,0],[4000,0,1000]]],['refund',[[4000,200,0],[1000,0,200]]],['expense',[[6000,300,0],[1000,0,300]]],['expense-refund',[[1000,50,0],[6000,0,50]]]])await seedJournal(audit,{id,lines});
}
test('REPORT-001 overview, expense breakdown and revenue trends reconcile reversals to GL',async({audit,page})=>{
  await financialFixture(audit);const overview=await audit.api('GET','reports/financial/overview'+range);expect(overview.status).toBe(200);
  audit.check('Financial overview',overview.body);expect.soft(Number(overview.body.summary.total_revenue)).toBe(800);expect.soft(Number(overview.body.summary.total_expenses)).toBe(250);expect.soft(Number(overview.body.summary.net_profit)).toBe(550);
  const breakdown=await audit.api('GET','reports/financial/expense-breakdown'+range);expect.soft(breakdown.body.reduce((n,r)=>n+Number(r.amount),0)).toBe(250);
  for(const groupBy of ['day','week','month']){const trends=await audit.api('GET','reports/financial/revenue-trends'+range+'&groupBy='+groupBy);expect.soft(trends.body.reduce((n,r)=>n+Number(r.revenue),0)).toBe(800);}
  await audit.session(page);await page.goto('/reports/financial');await expect(page.getByText('Financial Reports',{exact:true})).toBeVisible();
});
test('REPORT-001 inclusive end date contains transactions at 23:59:59',async({audit})=>{
  await seedJournal(audit,{date:'2026-11-30T23:59:59Z',lines:[[1000,123,0],[4000,0,123]]});
  const r=await audit.api('GET','reports/financial/overview'+range);expect(r.status).toBe(200);expect(Number(r.body.summary.total_revenue)).toBe(123);
});
test('REPORT-002 historical balance sheet excludes future account movements and satisfies equation',async({audit})=>{
  await seedJournal(audit,{date:'2026-10-01',lines:[[1000,100,0],[3009,0,100]]});await seedJournal(audit,{date:'2026-12-01',lines:[[1000,900,0],[2000,0,900]]});
  const r=await audit.api('GET','reports/financial/balance-sheet?date=2026-11-30');expect(r.status).toBe(200);expect.soft(r.body.summary.totalAssets).toBe(100);expect.soft(r.body.summary.totalLiabilities).toBe(0);expect(r.body.summary.totalAssets).toBe(r.body.summary.totalLiabilitiesAndEquity);
});
test('REPORT-003 capitalized advances and repayments agree in employee report and summary',async({audit})=>{
  await audit.pool.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,balance_after,transaction_date) VALUES(1,'Advance',1000,1000,'2026-11-09'),(1,'Repayment',400,600,'2026-11-10')");
  const r=await audit.api('GET','reports/hr/advances'+range);expect(r.status).toBe(200);expect.soft(Number(r.body.summary.total_advances_given)).toBe(1000);expect.soft(Number(r.body.summary.total_recovered)).toBe(400);expect(Number(r.body.advances[0].outstanding_balance)).toBe(600);
});
test('REPORT-004 attendance percentage includes the earned half-day proportion',async({audit})=>{
  await audit.pool.query("INSERT INTO attendance(employee_id,date,status) VALUES(1,'2026-11-09','Present'),(1,'2026-11-10','Half-Day'),(1,'2026-11-11','Absent')");
  const r=await audit.api('GET','reports/hr/attendance'+range);expect(r.status).toBe(200);expect.soft(Number(r.body.stats.attendance_rate)).toBe(50);expect(Number(r.body.employeeStats.find(e=>e.id===1).attendance_percentage)).toBe(50);
});
test('REPORT-005 approved/rejected bill counts and partial vendor payment reconcile exact fixtures',async({audit})=>{
  await billFixture(audit,{qty:2,rate:160,status:'Approved'});await billFixture(audit,{qty:1,rate:150,status:'Rejected'});
  await audit.pool.query("INSERT INTO vendor_ledger(supplier_id,date,transaction_type,amount) VALUES(1,'2026-11-09','Bill',320),(1,'2026-11-10','Payment',100)");
  const chicken=await audit.api('GET','reports/operations/chicken-analytics'+range);expect(chicken.status).toBe(200);expect(Number(chicken.body.billSummary.approved_bills)).toBe(1);expect(Number(chicken.body.billSummary.rejected_bills)).toBe(1);
  const vendors=await audit.api('GET','reports/operations/vendor-performance'+range);expect(vendors.status).toBe(200);expect(Number(vendors.body.vendorLedger[0].outstanding_balance)).toBe(220);
});
test('REPORT-006 stock valuation and dated wastage reconcile sale and waste deductions',async({audit})=>{
  expect((await order(audit)).status).toBe(200);expect((await audit.api('POST','wastage',{inventory_item_id:1,qty:0.5,reason:'Audit loss'})).status).toBe(200);
  const stock=await audit.api('GET','reports/inventory/stock-status');expect(stock.status).toBe(200);expect(Number(stock.body.summary.total_value)).toBe(3362.5);
  const waste=await audit.api('GET','reports/inventory/wastage'+range);expect(waste.status).toBe(200);expect(Number(waste.body.summary.total_cost)).toBe(75);
});
test('DASH-001 dashboard KPIs agree with net financial and advance balances',async({audit,page})=>{
  await financialFixture(audit);await audit.pool.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,balance_after) VALUES(1,'Advance',1000,1000),(1,'Repayment',400,600)");
  const r=await audit.api('GET','reports/dashboard/kpis'+range);expect(r.status).toBe(200);audit.check('Dashboard',r.body);
  expect.soft(Number(r.body.financial.total_revenue)).toBe(800);expect.soft(Number(r.body.financial.net_profit)).toBe(550);expect.soft(Number(r.body.advances.outstanding_advances)).toBe(600);
  await audit.session(page);await page.goto('/dashboard');await expect(page.getByText('Business Overview',{exact:true})).toBeVisible();
});
async function ticket(audit,date,qty){await audit.pool.query("INSERT INTO kds_tickets(items,status,completed_at) VALUES($1,'Done',$2)",[JSON.stringify([{id:1,qty}]),date]);}
test('AI-001 no history yields zero and weighted completed recipes retain ingredient units',async({audit})=>{
  const empty=await audit.api('GET','ai/forecast/1');expect(empty.status).toBe(200);expect(empty.body.forecast).toBe(0);
  await ticket(audit,'2026-11-07T12:00:00Z',4);await ticket(audit,'2026-11-09T12:00:00Z',12);
  const r=await audit.api('GET','ai/forecast/1');expect(r.status).toBe(200);expect.soft(r.body.forecast).toBe(2.33);expect(r.body.unit).toBe('kg');
});
test('AI-002 documented two-day lead plus one-day safety triggers strictly below reorder point',async({audit})=>{
  await ticket(audit,'2026-11-08T12:00:00Z',28);
  await audit.pool.query('UPDATE inventory_items SET stock_qty=3 WHERE id=1');expect((await audit.api('GET','ai/suggested-orders')).body.find(i=>i.inventory_item_id===1)).toBeUndefined();
  await audit.pool.query('UPDATE inventory_items SET stock_qty=2.99 WHERE id=1');const r=await audit.api('GET','ai/suggested-orders');expect(r.status).toBe(200);expect(r.body.find(i=>i.inventory_item_id===1)).toMatchObject({avg_daily_usage:1,reorder_point:3,suggested_order_qty:6});
});
test('CFG-001 bulk upsert/reorder, toggle and rollback preserve category-scoped configuration',async({audit})=>{
  const body={options:[{value:'audit-a',label:'Audit A'},{value:'audit-b',label:'Audit B'}]};
  for(let n=0;n<2;n++)expect((await audit.api('POST','config/audit-options/bulk-import',body)).status).toBe(200);
  const r=await audit.api('GET','config/audit-options');expect(r.body).toHaveLength(2);const ids=r.body.map(o=>o.id).reverse();
  expect((await audit.api('POST','config/audit-options/reorder',{orderedIds:ids})).status).toBe(200);expect((await audit.api('GET','config/audit-options')).body.map(o=>o.id)).toEqual(ids);
  expect((await audit.api('PATCH','config/audit-options/'+ids[0]+'/toggle',{})).status).toBe(200);expect((await audit.api('GET','config/audit-options')).body).toHaveLength(1);
  const before=await snapshot(audit,['config_options']);expect((await audit.api('POST','config/audit-options/bulk-import',{options:[{value:'audit-c',label:'C'},{value:null,label:null}]})).status).toBe(400);expect(await snapshot(audit,['config_options'])).toEqual(before);
});
test('CFG-001 inactive options remain reachable in the management screen for reactivation',async({audit,page})=>{
  const r=await audit.api('POST','config/item_categories',{value:'audit-inactive',label:'Audit Inactive Option'});expect(r.status).toBe(201);await audit.api('PATCH','config/item_categories/'+r.body.id+'/toggle',{});
  await audit.session(page);await page.goto('/config');await expect(page.getByText('Audit Inactive Option',{exact:true})).toBeVisible();
});
test('CFG-002 staff cannot mutate and an ID from another category cannot be deleted',async({audit})=>{
  const before=await snapshot(audit,['config_options']);expect.soft((await audit.api('POST','config/units',{value:'unauthorized',label:'Unauthorized'},'staff')).status).toBe(403);expect.soft(await snapshot(audit,['config_options'])).toEqual(before);
  const r=await audit.api('POST','config/units',{value:'audit-unit',label:'Audit Unit'});expect(r.status).toBe(201);
  expect.soft((await audit.api('DELETE','config/payment_types/'+r.body.id)).status).toBe(404);expect(await audit.rows('SELECT id FROM config_options WHERE id=$1',[r.body.id])).toHaveLength(1);
});
test('CFG-002 partial label update retains value, activation, metadata and display order',async({audit})=>{
  const r=await audit.api('POST','config/units',{value:'audit-unit',label:'Old',display_order:17,metadata:{test:true}});expect(r.status).toBe(201);
  const updated=await audit.api('PUT','config/units/'+r.body.id,{label:'New'});expect(updated.status).toBe(200);expect(updated.body).toMatchObject({label:'New',value:'audit-unit',display_order:17,is_active:true,metadata:{test:true}});
});
test('CFG-003 configured active payment label is accepted by financial services',async({audit})=>{
  const modes=await audit.api('GET','finance/payment-modes');expect(modes.status).toBe(200);
  for(const mode of modes.body){const r=await audit.api('POST','finance/revenue',{date:audit.DATE,amount:10,description:'Configured '+mode.display_name,payment_mode:mode.display_name});expect.soft(r.status,mode.display_name).toBe(200);}
});
