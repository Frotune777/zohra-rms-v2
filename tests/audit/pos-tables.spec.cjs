const {test,expect}=require('./fixtures.cjs');
const {journal,snapshot}=require('./helpers.cjs');

for(const number of Array.from({length:12},(_,index)=>String(index+1))) {
  test('POS-002 table '+number+' opens its cart and automatically persists the table at checkout',async({audit,page})=>{
    await audit.login(page,'staff');
    await expect(page.getByRole('button',{name:/^Table \d+$/})).toHaveCount(12);
    await expect(page.getByRole('button',{name:'SAVE',exact:true})).toHaveCount(0);
    await audit.openTable(page,number);
    await expect(page.getByLabel('Table number')).toHaveCount(0);
    await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();
    const pending=page.waitForResponse(response=>response.url().endsWith('/api/orders') && response.request().method()==='POST');
    await page.getByRole('button',{name:'SAVE',exact:true}).click();
    const response=await pending;expect(response.status()).toBe(200);const saved=await response.json();
    expect(response.request().postDataJSON()).toMatchObject({tableNumber:number,customerPhone:'',type:'Dine In'});
    expect((await audit.rows('SELECT table_number,customer_id,total_amount,created_by FROM orders WHERE id=$1',[saved.orderId]))[0]).toEqual({table_number:number,customer_id:null,total_amount:'100.00',created_by:audit.actors.staff.user.id});
    await journal(audit,'POSOrder',saved.orderId,[{account:1000,debit:100,credit:0},{account:4000,debit:0,credit:100}]);
    await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
  });
}
for(const [role,mode,paid] of [['owner','Due',0],['manager','Part',40],['staff','Due',0]]) {
  test('POS-004 '+role+' '+mode+' checkout without a phone records debt and can collect payment later',async({audit,page})=>{
    await audit.login(page,role);await audit.openTable(page,'12');
    await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();
    await page.getByText(mode,{exact:true}).last().click();
    if(mode==='Part') await page.getByLabel('Amount paid now').fill(String(paid));
    await expect(page.getByLabel('Customer phone')).not.toHaveAttribute('required');
    await page.getByRole('button',{name:'SAVE',exact:true}).click();
    await expect(page.getByText('Order Saved!',{exact:true})).toBeVisible();
    const [order]=await audit.rows('SELECT * FROM orders');
    expect(order).toMatchObject({table_number:'12',customer_id:null,paid_amount:paid.toFixed(2),payment_status:mode});
    const lines=[{account:1120,debit:100-paid,credit:0},{account:4000,debit:0,credit:100}];
    if(paid) lines.push({account:1000,debit:paid,credit:0});
    await journal(audit,'POSOrder',order.id,lines);
    await page.goto('/orders');await page.getByRole('button',{name:'Pay order #'+order.id}).click();
    await page.getByRole('button',{name:'Collect payment',exact:true}).click();
    await expect(page.getByText('Order payment recorded',{exact:true})).toBeVisible();
    expect((await audit.rows('SELECT paid_amount,payment_status FROM orders'))[0]).toEqual({paid_amount:'100.00',payment_status:'Paid'});
    const [payment]=await audit.rows('SELECT id FROM payment_transactions WHERE idempotency_key IS NOT NULL');
    await journal(audit,'OrderSettlement',payment.id,[{account:1000,debit:100-paid,credit:0},{account:1120,debit:0,credit:100-paid}]);
  });
}
test('POS-002 POS-009 table carts remain separate across navigation, browser back and reload',async({audit,page})=>{
  await audit.login(page);await audit.openTable(page,'1');
  await page.getByRole('button',{name:'Audit Chicken Bowl ₹250.00'}).click();
  await page.getByLabel('Customer name').fill('Guest One');await page.getByLabel('Order notes').fill('No onions');
  await page.getByText('Due',{exact:true}).last().click();
  await page.getByRole('button',{name:'Back to tables'}).click();
  await expect(page.getByRole('button',{name:'Table 1',exact:true})).toContainText('Saved cart · 1 items');
  await audit.openTable(page,'2');await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();
  await page.getByRole('button',{name:'Back to tables'}).click();await audit.openTable(page,'1');
  await expect(page.getByLabel('Customer name')).toHaveValue('Guest One');await expect(page.getByLabel('Order notes')).toHaveValue('No onions');
  await expect(page.getByRole('radio',{name:'Due',exact:true})).toBeChecked();await expect(page.getByText('₹ 250.00',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('₹ 250.00',{exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByRole('heading',{name:'Select a table'})).toBeVisible();
  await audit.openTable(page,'2');await expect(page.getByText('₹ 100.00',{exact:true})).toBeVisible();
  expect(await audit.rows('SELECT id FROM orders')).toHaveLength(0);
});
for(const type of ['Delivery','Pick Up']) {
  test('POS-002 '+type+' stays accessible from home and does not inherit table cart or number',async({audit,page})=>{
    await audit.login(page);await audit.openTable(page,'4');await page.getByRole('button',{name:'Audit Chicken Bowl ₹250.00'}).click();
    await page.getByRole('button',{name:'Back to tables'}).click();await page.getByRole('button',{name:type,exact:true}).click();
    await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();await page.getByText('Due',{exact:true}).last().click();
    await page.getByRole('button',{name:'SAVE',exact:true}).click();await expect(page.getByText('Order Saved!',{exact:true})).toBeVisible();
    expect((await audit.rows('SELECT order_type,table_number,customer_id FROM orders'))[0]).toEqual({order_type:type,table_number:null,customer_id:null});
    await page.getByRole('button',{name:'Back to tables'}).click();await audit.openTable(page,'4');await expect(page.getByText('₹ 250.00',{exact:true})).toBeVisible();
  });
}
test('POS-001 failed table and menu loads expose working retry controls',async({audit,page})=>{
  await audit.session(page);let failTables=true,failMenu=true;
  await page.route('**/api/tables',route=>failTables?route.fulfill({status:503,contentType:'application/json',body:'{"error":"temporary"}'}):route.continue());
  await page.goto('/');await expect(page.getByText('Unable to load tables.',{exact:true})).toBeVisible();
  failTables=false;await page.getByRole('button',{name:'Retry loading tables'}).click();
  await page.route('**/api/menu',route=>failMenu?route.fulfill({status:503,contentType:'application/json',body:'{"error":"temporary"}'}):route.continue());
  await audit.openTable(page);await expect(page.getByRole('alert').filter({hasText:'Unable to load menu'})).toContainText('Unable to load menu');
  failMenu=false;await page.getByRole('button',{name:'Retry loading menu'}).click();
  await expect(page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'})).toBeVisible();
  expect(await audit.rows('SELECT id FROM orders')).toHaveLength(0);
});
test('CFG-001 POS-002 manager can load, rename and deactivate dining tables without granting staff configuration access',async({audit,page})=>{
  await audit.login(page,'manager');await page.goto('/config');
  await page.getByRole('button',{name:'Dining Tables',exact:true}).click();await page.getByRole('button',{name:'Load tables 1–12'}).click();
  await expect(page.getByText('Dining tables loaded',{exact:true})).toBeVisible();
  const [option]=await audit.rows("SELECT id FROM config_options WHERE category='dining_tables' AND value='12'");
  const row=page.getByRole('group',{name:'Table 12',exact:true});
  await row.getByRole('button',{name:'Edit',exact:true}).click();await row.getByLabel('Label').fill('Patio 12');
  await row.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Option updated successfully',{exact:true})).toBeVisible();
  await page.goto('/');await page.getByRole('button',{name:'Patio 12',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Patio 12'})).toBeVisible();
  expect((await audit.api('PATCH','config/dining_tables/'+option.id+'/toggle',{},'manager')).status).toBe(200);
  await page.goto('/');await expect(page.getByRole('button',{name:'Patio 12',exact:true})).toHaveCount(0);
  expect((await audit.api('GET','tables',undefined,'staff')).body).toHaveLength(11);
  expect((await audit.api('GET','config/dining_tables',undefined,'staff')).status).toBe(403);
});
for(const width of [375,768,1440]) {
  test('SCREEN-002 POS-002 table home and phone-free checkout work at viewport '+width,async({audit,page})=>{
    await page.setViewportSize({width,height:900});await audit.login(page,'staff');await audit.openTable(page,'12');
    await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();
    await page.getByRole('button',{name:'SAVE',exact:true}).click();await expect(page.getByText('Order Saved!',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    expect((await audit.rows('SELECT table_number FROM orders'))[0].table_number).toBe('12');
  });
}
test('POS-005 phone-free partial checkout with oversized payment still rejects atomically and keeps the cart',async({audit,page})=>{
  await audit.login(page);await audit.openTable(page,'5');await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();
  await page.getByText('Part',{exact:true}).last().click();await page.getByLabel('Amount paid now').fill('101');
  const before=await snapshot(audit,['orders','customers','order_items','payment_transactions','inventory_items','inventory_transactions','stock_movements','journal_entries','ledger_lines','kds_tickets','operation_keys']);
  await page.getByRole('button',{name:'SAVE',exact:true}).click();await expect(page.getByText('Partial payment must be below order total',{exact:true})).toBeVisible();
  expect(await snapshot(audit,['orders','customers','order_items','payment_transactions','inventory_items','inventory_transactions','stock_movements','journal_entries','ledger_lines','kds_tickets','operation_keys'])).toEqual(before);
  await expect(page.getByText('₹ 100.00',{exact:true})).toBeVisible();
});
for(const tableNumber of ['A7','']) {
  test('POS-009 legacy saved cart '+(tableNumber || 'without a table')+' resumes a committed checkout without duplicate writes',async({audit,page})=>{
    const items=[{id:2,name:'Audit Rice Bowl',price:'100.00',category:'Curry',qty:1}];
    const details={customerName:'Legacy Guest',customerPhone:'',tableNumber,notes:'Preserve',discount:'0',amountPaid:'',partialPaymentMode:'Cash'};
    const request={items,type:'Dine In',paymentMode:'Cash',...details};
    const key='legacy-committed-checkout';
    const original=await audit.api('POST','orders',request,'owner',{'Idempotency-Key':key});expect(original.status).toBe(200);
    const state=await snapshot(audit,['orders','customers','order_items','payment_transactions','inventory_items','inventory_transactions','stock_movements','journal_entries','ledger_lines','kds_tickets','operation_keys']);
    await audit.login(page);await page.evaluate(({actorId,draft})=>sessionStorage.setItem('pos-draft:'+actorId,JSON.stringify(draft)),{actorId:tableNumber ? audit.actors.owner.user.id : 'session',draft:{items,type:'Dine In',paymentMode:'Cash',details,request,key}});
    await page.reload();await page.getByRole('button',{name:'Resume previous saved order'}).click();
    await expect(page.getByRole('heading',{name:tableNumber?'Table '+tableNumber:'Saved dine-in order',exact:true})).toBeVisible();
    const pending=page.waitForResponse(response=>response.url().endsWith('/api/orders') && response.request().method()==='POST');
    await page.getByRole('button',{name:'SAVE',exact:true}).click();const response=await pending;expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual(request);expect(await response.json()).toEqual(original.body);
    expect(await snapshot(audit,['orders','customers','order_items','payment_transactions','inventory_items','inventory_transactions','stock_movements','journal_entries','ledger_lines','kds_tickets','operation_keys'])).toEqual(state);
  });
}

test('POS-002 POS-009 real account switching keeps table drafts scoped to the authenticated actor',async({audit,page})=>{
  await audit.login(page,'owner');await audit.openTable(page,'1');await page.getByRole('button',{name:'Audit Rice Bowl ₹100.00'}).click();
  await page.getByLabel('Customer name').fill('Owner Guest');
  expect(await page.evaluate(()=>localStorage.getItem('user'))).toBeNull();
  expect(await page.evaluate(actorId=>JSON.parse(sessionStorage.getItem('pos-draft:'+actorId+':table:1')).details.customerName,audit.actors.owner.user.id)).toBe('Owner Guest');
  await audit.login(page,'staff');await audit.openTable(page,'1');await expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Customer name')).toHaveValue('');await page.getByRole('button',{name:'Audit Chicken Bowl ₹250.00'}).click();
  await audit.login(page,'owner');await audit.openTable(page,'1');await expect(page.getByText('₹ 100.00',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Customer name')).toHaveValue('Owner Guest');expect(await audit.rows('SELECT id FROM orders')).toHaveLength(0);
});
