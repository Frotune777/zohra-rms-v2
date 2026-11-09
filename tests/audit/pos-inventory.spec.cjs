const {test,expect}=require('./fixtures.cjs');
const {order,journal,snapshot}=require('./helpers.cjs');
test('POS-001 search and category filters show exact menu matches and empty results',async({audit,page})=>{
  await audit.login(page);await audit.openTable(page);expect((await audit.api('GET','menu')).body).toHaveLength(2);
  await page.getByPlaceholder('Search item...').fill('Chicken');
  await expect(page.getByText('Audit Chicken Bowl',{exact:true})).toBeVisible();
  await expect(page.getByText('Audit Rice Bowl',{exact:true})).toHaveCount(0);
  await page.getByPlaceholder('Search item...').fill('');await page.getByRole('button',{name:'Curry',exact:true}).click();
  await expect(page.getByText('Audit Rice Bowl',{exact:true})).toBeVisible();
  await expect(page.getByText('Audit Chicken Bowl',{exact:true})).toHaveCount(0);
  await page.getByPlaceholder('Search item...').fill('not-a-menu-item');
  await expect(page.getByText('Audit Rice Bowl',{exact:true})).toHaveCount(0);
});
test('POS-002 cart merges items, calculates exact totals and prevents empty checkout',async({audit,page})=>{
  await audit.login(page);await audit.openTable(page);await expect(page.getByRole('button',{name:'SAVE',exact:true})).toBeDisabled();
  await page.getByText('Audit Chicken Bowl',{exact:true}).click();
  await page.getByText('Audit Chicken Bowl',{exact:true}).first().click();
  await expect(page.getByText('₹ 500.00',{exact:true})).toBeVisible();
  const row=page.getByText('Audit Chicken Bowl',{exact:true}).last().locator('..');
  await row.getByRole('button').first().click();await expect(page.getByText('₹ 250.00',{exact:true})).toBeVisible();
  await row.getByRole('button').nth(1).click();await expect(page.getByText('₹ 500.00',{exact:true})).toBeVisible();
  await row.getByRole('button').last().click();await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
  expect(await audit.rows('SELECT id FROM orders')).toHaveLength(0);
});
test('POS-003 the server uses stored prices and rejects unknown menu IDs atomically',async({audit})=>{
  const r=await order(audit,{items:[{id:1,qty:1,price:1,name:'Tampered'}]});
  expect(r.status).toBe(200);expect.soft(r.body.totalAmount).toBe(250);
  const before=await snapshot(audit);
  expect.soft((await order(audit,{items:[{id:99999,qty:1,price:250}]})).status).toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
for(const [mode,account] of [['Cash',1000],['Card',1010]])
  test('POS-004 '+mode+' UI checkout persists its payment mode and matching journal',async({audit,page})=>{
    await audit.login(page);await audit.openTable(page);await page.getByText('Audit Chicken Bowl',{exact:true}).click();
    await page.getByText(mode,{exact:true}).last().click();
    const pending=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'SAVE',exact:true}).click();const response=await pending;
    expect(response.status()).toBe(200);const body=await response.json();
    await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
    const [stored]=await audit.rows('SELECT payment_mode,total_amount FROM orders WHERE id=$1',[body.orderId]);
    expect.soft(stored.payment_mode).toBe(mode);expect(Number(stored.total_amount)).toBe(250);
    expect.soft((await audit.rows('SELECT payment_method FROM payment_transactions WHERE order_id=$1',[body.orderId]))[0].payment_method).toBe(mode);
    await journal(audit,'POSOrder',body.orderId,[{account,debit:250,credit:0},{account:4000,debit:0,credit:250}]);
  });
for(const quantity of [0,-1,0.5,'NaN','Infinity'])
  test('POS-005 invalid quantity '+quantity+' is rejected without stock, payment or journal writes',async({audit})=>{
    const before=await snapshot(audit);const r=await order(audit,{items:[{id:1,qty:quantity,price:250}]});
    expect.soft(r.status).toBe(400);expect(await snapshot(audit)).toEqual(before);
  });
test('POS-006 explicit tax reconciles order, payment and journal cents',async({audit})=>{
  await audit.pool.query("INSERT INTO tax_rates(name,rate_percentage) VALUES('Audit GST',0.05) RETURNING id").then(async r=>audit.pool.query('UPDATE menu_items SET tax_rate_id=$1 WHERE id=1',[r.rows[0].id]));
  const r=await order(audit);expect(r.status).toBe(200);
  expect(r.body.totalAmount).toBe(262.50);
  const [payment]=await audit.rows('SELECT amount FROM payment_transactions WHERE order_id=$1',[r.body.orderId]);
  expect(Number(payment.amount)).toBe(262.50);
  await journal(audit,'POSOrder',r.body.orderId,[{account:1000,debit:262.50,credit:0},
    {account:4000,debit:0,credit:250},{account:2100,debit:0,credit:12.50}]);
});
test('POS-007 shared recipe ingredients produce exact stock deductions and separate revenue/COGS journals',async({audit})=>{
  const r=await order(audit,{items:[{id:1,qty:2,price:250},{id:2,qty:1,price:100}]});expect(r.status).toBe(200);
  expect(r.body.totalAmount).toBe(600);
  expect((await audit.rows('SELECT stock_qty FROM inventory_items ORDER BY id')).map(i=>Number(i.stock_qty))).toEqual([19.5,8.5]);
  const movement=await audit.rows('SELECT inventory_item_id,sum(quantity) AS quantity FROM inventory_transactions WHERE reference_type=$1 AND reference_id=$2 GROUP BY inventory_item_id ORDER BY inventory_item_id',['Order',String(r.body.orderId)]);
  expect(movement.map(m=>[m.inventory_item_id,Number(m.quantity)])).toEqual([[1,-0.5],[2,-1.5]]);
  await journal(audit,'POSOrder',r.body.orderId,[{account:1000,debit:600,credit:0},{account:4000,debit:0,credit:600}]);
  await journal(audit,'COGS',r.body.orderId,[{account:5000,debit:150,credit:0},{account:1200,debit:0,credit:150}]);
});
test('POS-008 simultaneous last-stock orders cannot overdraw ingredients',async({audit})=>{
  await audit.pool.query('UPDATE inventory_items SET stock_qty=0.25 WHERE id=1');
  const responses=await Promise.all([order(audit),order(audit)]);
  expect.soft(responses.filter(r=>r.status===200)).toHaveLength(1);
  expect(Number((await audit.rows('SELECT stock_qty FROM inventory_items WHERE id=1'))[0].stock_qty)).toBe(0);
});
test('POS-009 retrying one idempotency key creates one durable order/payment/source journal',async({audit})=>{
  const data={items:[{id:1,qty:1,price:250}],paymentMethod:'Cash'};
  for(let n=0;n<2;n++) expect((await audit.api('POST','orders',data,'owner',{'Idempotency-Key':'audit-same-checkout'})).status).toBe(200);
  expect.soft(await audit.rows('SELECT id FROM orders')).toHaveLength(1);
  expect.soft(await audit.rows('SELECT id FROM payment_transactions')).toHaveLength(1);
  expect(await audit.rows("SELECT id FROM journal_entries WHERE reference_type='POSOrder'")).toHaveLength(1);
});
test('POS-010 advertised SAVE & PRINT actually invokes printing after a committed sale',async({audit,page})=>{
  await audit.login(page);await audit.openTable(page);await page.evaluate(()=>{window.auditPrinted=0;window.print=()=>{window.auditPrinted++;};});
  await page.getByText('Audit Chicken Bowl',{exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'SAVE & PRINT',exact:true}).click();expect((await response).status()).toBe(200);
  await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.auditPrinted)).toBe(1);
});
test('MENU-001 supported menu creation/deletion persists and edit availability is explicit',async({audit,page})=>{
  const r=await audit.api('POST','menu',{name:'Audit New Dish',price:80,category:'Starter'});expect(r.status).toBe(200);
  expect((await audit.rows('SELECT name,price FROM menu_items WHERE id=$1',[r.body.id]))[0]).toEqual({name:'Audit New Dish',price:'80.00'});
  await audit.session(page);await page.goto('/menu');await expect(page.getByText('Audit New Dish',{exact:true})).toBeVisible();
  expect.soft(await page.getByRole('button',{name:/edit/i}).count(),'Advertised menu editing').toBeGreaterThan(0);
  expect((await audit.api('DELETE','menu/'+r.body.id)).status).toBe(200);
  expect(await audit.rows('SELECT id FROM menu_items WHERE id=$1',[r.body.id])).toHaveLength(0);
});
test('MENU-002 deleting a sold menu item preserves historical order details and recipes',async({audit})=>{
  const sale=await order(audit);expect(sale.status).toBe(200);
  const before=await snapshot(audit,['order_items','recipe_ingredients']);
  expect.soft((await audit.api('DELETE','menu/1')).status).toBe(409);
  expect(await snapshot(audit,['order_items','recipe_ingredients'])).toEqual(before);
});
test('INV-001 zero and fractional initial stock preserve exact quantities, cost and initial movements',async({audit})=>{
  for(const qty of [0,1.25]) {
    const r=await audit.api('POST','inventory',{name:'Audit stock '+qty,stock_qty:qty,unit:'kg',unit_cost:12.34});expect(r.status).toBe(201);
    expect(Number(r.body.stock_qty)).toBe(qty);expect(Number(r.body.unit_cost)).toBe(12.34);
    const moves=await audit.rows('SELECT quantity_change,created_by_user_id FROM stock_movements WHERE inventory_item_id=$1',[r.body.id]);
    expect(moves).toHaveLength(qty>0?1:0);
    if(qty>0){expect(Number(moves[0].quantity_change)).toBe(1.25);expect(moves[0].created_by_user_id).toBe(audit.actors.owner.user.id);}
  }
});
test('INV-002 quantity edits record direction, exact delta and actor attribution',async({audit})=>{
  for(const [qty,type,change] of [[22.5,'ADJ_IN',2.5],[20,'ADJ_OUT',2.5]]) {
    const r=await audit.api('PUT','inventory/1',{name:'Audit Chicken',stock_qty:qty,unit:'kg',unit_cost:150});expect(r.status).toBe(200);
    const [move]=await audit.rows('SELECT * FROM stock_movements WHERE inventory_item_id=1 ORDER BY id DESC LIMIT 1');
    expect(move.movement_type).toBe(type);expect(Number(move.quantity_change)).toBe(type==='ADJ_OUT'?-change:change);expect(move.created_by_user_id).toBe(audit.actors.owner.user.id);
  }
});
for(const input of [{stock_qty:-1,unit_cost:150},{stock_qty:20,unit_cost:-1},{stock_qty:'NaN',unit_cost:150}])
  test('INV-003 invalid inventory values '+JSON.stringify(input)+' leave no partial changes',async({audit})=>{
    const before=await snapshot(audit);expect.soft((await audit.api('PUT','inventory/1',{name:'Audit Chicken',unit:'kg',...input})).status).toBe(400);
    expect(await snapshot(audit)).toEqual(before);
  });
test('INV-004 deleting inventory with historical wastage preserves dependencies',async({audit})=>{
  await audit.pool.query("INSERT INTO wastage_logs(inventory_item_id,qty,cost,reason) VALUES(1,1,150,'Historical wastage')");
  const before=await snapshot(audit,['inventory_items','recipe_ingredients','wastage_logs']);
  expect.soft((await audit.api('DELETE','inventory/1')).status).toBe(409);
  expect(await snapshot(audit,['inventory_items','recipe_ingredients','wastage_logs'])).toEqual(before);
});
test('INV-005 fractional wastage links the log, stock deduction and journal',async({audit})=>{
  const r=await audit.api('POST','wastage',{inventory_item_id:1,qty:0.5,reason:'Audit spoiled'});expect(r.status).toBe(200);
  expect(Number((await audit.rows('SELECT stock_qty FROM inventory_items WHERE id=1'))[0].stock_qty)).toBe(19.5);
  expect(Number(r.body.cost)).toBe(75);expect(r.body.reported_by).toBe('owner@audit.invalid');
  const head=await journal(audit,'Wastage',r.body.id,[{account:6000,debit:75,credit:0},{account:1200,debit:0,credit:75}]);
  expect.soft((await audit.rows('SELECT journal_entry_id FROM wastage_logs WHERE id=$1',[r.body.id]))[0].journal_entry_id).toBe(head.id);
  expect(await audit.rows('SELECT id FROM stock_movements WHERE inventory_item_id=1')).toHaveLength(1);
});
test('INV-006 excessive wastage is rejected and preserves inventory and accounting',async({audit})=>{
  const before=await snapshot(audit);expect.soft((await audit.api('POST','wastage',{inventory_item_id:1,qty:21,reason:'Excess'})).status).toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
