const {integration}=require('./helpers/integration');
const ctx=integration();
const po=(items=[{inventory_item_id:1,qty:2,unit_cost:160}],supplier_id=1)=>ctx.api('POST','inventory/po',{supplier_id,items});
const status=(id,value)=>ctx.api('PUT','inventory/po/'+id+'/status',{status:value});

describe('Purchase orders: every supported state and atomic receipt failures',()=>{
  test.each(['Draft','Sent'])('receives a %s PO once using weighted book value',async initial=>{
    const created=await po();expect(created.status).toBe(200);
    if(initial==='Sent')expect((await status(created.body.id,'Sent')).status).toBe(200);
    expect(await ctx.rows('SELECT stock_qty,stock_value FROM inventory_items WHERE id=1')).toEqual([{stock_qty:'20.0000',stock_value:'3000.00'}]);
    expect((await status(created.body.id,'Received')).status).toBe(200);
    expect(await ctx.rows('SELECT stock_qty,stock_value,unit_cost FROM inventory_items WHERE id=1')).toEqual([{stock_qty:'22.0000',stock_value:'3320.00',unit_cost:'150.91'}]);
    await ctx.journal('PurchaseOrder',created.body.id,[{account:1200,debit:320,credit:0},{account:2000,debit:0,credit:320}]);
    expect(await ctx.rows('SELECT qty_received FROM purchase_order_items')).toEqual([{qty_received:'2.00'}]);
    expect(await ctx.rows('SELECT value,created_by FROM stock_receipts')).toEqual([{value:'320.00',created_by:ctx.actors.owner.id}]);
    const before=await ctx.snapshot();expect((await status(created.body.id,'Received')).status).toBe(200);expect(await ctx.snapshot()).toEqual(before);
    expect((await ctx.api('GET','inventory/po')).body[0].items[0]).toMatchObject({qty:2,qty_received:2});
  });
  test('zero-cost receipts change stock without creating debt or a zero journal',async()=>{
    const created=await po([{inventory_item_id:1,qty:1,unit_cost:0}]);expect(created.status).toBe(200);
    expect((await status(created.body.id,'Received')).status).toBe(200);
    expect(await ctx.rows('SELECT stock_qty,stock_value FROM inventory_items WHERE id=1')).toEqual([{stock_qty:'21.0000',stock_value:'3000.00'}]);
    expect(await ctx.rows('SELECT id FROM journal_entries')).toEqual([]);expect(await ctx.rows('SELECT id FROM vendor_ledger')).toEqual([]);
  });
  test.each([['Sent','Draft'],['Received','Draft'],['Received','Sent'],['Received','Cancelled'],['Cancelled','Draft'],['Cancelled','Sent'],['Cancelled','Received']])('rejects %s -> %s and retains the original receipt/state',async(from,to)=>{
    const created=await po();expect((await status(created.body.id,from)).status).toBe(200);const before=await ctx.snapshot();
    expect((await status(created.body.id,to)).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([undefined,[],[{inventory_item_id:1,qty:0,unit_cost:1}],[{inventory_item_id:1,qty:-1,unit_cost:1}],[{inventory_item_id:1,qty:1,unit_cost:-1}],[{inventory_item_id:1,qty:0.001,unit_cost:1}],[{inventory_item_id:1,qty:1,unit_cost:0.001}],[{inventory_item_id:1,qty:1,unit_cost:1},{inventory_item_id:'1',qty:1,unit_cost:1}]])('invalid PO items %p create no partial source',async items=>{
    const before=await ctx.snapshot();const result=items===undefined?await ctx.api('POST','inventory/po',{supplier_id:1}):await po(items);expect(result.status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([[99999,[{inventory_item_id:1,qty:1,unit_cost:1}]],[1,[{inventory_item_id:99999,qty:1,unit_cost:1}]]])('foreign-key failure for supplier %i is atomic',async(supplier,items)=>{
    const before=await ctx.snapshot();expect((await po(items,supplier)).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('unknown PO and invalid status reject without writes',async()=>{
    const before=await ctx.snapshot();expect((await status(99999,'Received')).status).toBe(404);expect((await status(99999,'Bad')).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['Locked','Closed'])('%s period blocks receipt with the draft intact',async period=>{
    const created=await po();await ctx.closedPeriod(period);const before=await ctx.snapshot();expect((await status(created.body.id,'Received')).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['stock_receipts','vendor_ledger','ledger_lines','purchase_orders'])('late receipt failure at %s restores all stock, debt and PO state',async table=>{
    const created=await po([{inventory_item_id:1,qty:2,unit_cost:160},{inventory_item_id:2,qty:1,unit_cost:60}]);
    await ctx.failOn(table,table==='purchase_orders'?'UPDATE':'INSERT',table==='stock_receipts'?'NEW.inventory_item_id=2':'TRUE');const before=await ctx.snapshot();
    const result=await status(created.body.id,'Received');expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
});

describe('Configuration CRUD, scoped identity and atomic multi-row writes',()=>{
  const add=(patch={})=>ctx.api('POST','config/jest',{value:'one',label:'One',...patch});
  test('create/update/toggle/reorder/delete persist metadata and preserve omitted fields',async()=>{
    const first=await add({metadata:{nested:{enabled:true}}});expect(first.status).toBe(201);expect(first.body.created_by).toBe(ctx.actors.owner.id);
    const second=await add({value:'two',label:'Two'});
    const changed=await ctx.api('PUT','config/jest/'+first.body.id,{label:'First'});expect(changed.status).toBe(200);expect(changed.body).toMatchObject({label:'First',value:'one',metadata:{nested:{enabled:true}}});
    expect((await ctx.api('PATCH','config/jest/'+first.body.id+'/toggle')).body.is_active).toBe(false);
    expect((await ctx.api('GET','config/jest')).body.map(o=>o.value)).toEqual(['two']);
    expect((await ctx.api('GET','config/jest?includeInactive=true')).body).toHaveLength(2);
    expect((await ctx.api('POST','config/jest/reorder',{orderedIds:[second.body.id,first.body.id]})).status).toBe(200);
    expect((await ctx.api('GET','config/jest?includeInactive=true')).body.map(o=>[o.value,o.display_order])).toEqual([['two',1],['one',2]]);
    expect((await ctx.api('GET','config/categories')).body.find(c=>c.category==='jest')).toMatchObject({total_options:'2',active_options:'1'});
    expect((await ctx.api('DELETE','config/jest/'+first.body.id)).status).toBe(200);
    expect((await ctx.api('GET','config/jest?includeInactive=true')).body.map(o=>o.value)).toEqual(['two']);
  });
  test('duplicate values return409 and leave existing metadata untouched',async()=>{
    await add({metadata:{retained:true}});const before=await ctx.snapshot();expect((await add({metadata:{retained:false}})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['PUT','DELETE','PATCH'])('%s cannot operate on an option from another category',async method=>{
    const row=await add();const before=await ctx.snapshot();const route='config/other/'+row.body.id+(method==='PATCH'?'/toggle':'');
    expect((await ctx.api(method,route,method==='PUT'?{label:'Wrong'}:undefined)).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
  });
  test('reorder does not mutate an option from another category',async()=>{
    const one=await add();const other=await ctx.api('POST','config/other',{value:'other',label:'Other',display_order:8});
    expect((await ctx.api('POST','config/jest/reorder',{orderedIds:[other.body.id,one.body.id]})).status).toBe(200);
    expect((await ctx.api('GET','config/other')).body[0].display_order).toBe(8);
  });
  test('bulk import updates same-category values and preserves another category',async()=>{
    await add();await ctx.api('POST','config/other',{value:'one',label:'Unchanged'});
    const result=await ctx.api('POST','config/jest/bulk-import',{options:[{value:'one',label:'Updated',metadata:{x:1}},{value:'two',label:'New',display_order:3}]});
    expect(result.status).toBe(200);expect(result.body.count).toBe(2);
    expect((await ctx.api('GET','config/jest')).body.map(o=>[o.value,o.label,o.metadata])).toEqual([['one','Updated',{x:1}],['two','New',{}]]);
    expect((await ctx.api('GET','config/other')).body[0].label).toBe('Unchanged');
  });
  test('a malformed later import row rejects the whole batch before writes',async()=>{
    const before=await ctx.snapshot();const result=await ctx.api('POST','config/jest/bulk-import',{options:[{value:'valid',label:'Valid'},{value:'missing-label'}]});expect(result.status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('a database failure on the second import restores earlier upserts and inserts',async()=>{
    await add({metadata:{retained:true}});await ctx.failOn('config_options','INSERT',"NEW.value='two'");const before=await ctx.snapshot();
    const result=await ctx.api('POST','config/jest/bulk-import',{options:[{value:'one',label:'Changed'},{value:'two',label:'Two'}]});
    expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([{value:''},{label:'   '},{value:42},{metadata:null},{metadata:[]},{display_order:-1},{display_order:1.5},{is_active:'true'}])('invalid option %p is rejected on both create and update',async patch=>{
    const one=await add();const before=await ctx.snapshot();
    expect((await add(patch)).status).toBe(400);expect((await ctx.api('PUT','config/jest/'+one.body.id,patch)).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([undefined,null,{},'options',[null],[]])('import handles malformed/empty batch %p without writes',async options=>{
    const before=await ctx.snapshot();expect((await ctx.api('POST','config/jest/bulk-import',{options})).status).toBe(Array.isArray(options)&&options.length===0?200:400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([undefined,null,{},[1,1],[0],[-1],['invalid'],[1.5]])('invalid reorder %p rejects without changes',async orderedIds=>{
    const before=await ctx.snapshot();expect((await ctx.api('POST','config/jest/reorder',{orderedIds})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('empty updates reject and update collisions return409 without altering either option',async()=>{
    const one=await add();await add({value:'two',label:'Two'});const before=await ctx.snapshot();
    expect((await ctx.api('PUT','config/jest/'+one.body.id,{})).status).toBe(400);
    expect((await ctx.api('PUT','config/jest/'+one.body.id,{value:'two'})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('a later reorder failure rolls back the first updated position',async()=>{
    const one=await add();const two=await add({value:'two',label:'Two'});await ctx.failOn('config_options','UPDATE','NEW.id='+two.body.id);const before=await ctx.snapshot();
    expect((await ctx.api('POST','config/jest/reorder',{orderedIds:[one.body.id,two.body.id]})).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([['GET','config/jest'],['POST','config/jest'],['PUT','config/jest/1'],['DELETE','config/jest/1'],['PATCH','config/jest/1/toggle'],['POST','config/jest/reorder'],['POST','config/jest/bulk-import']])('staff cannot %s %s',async(method,path)=>{
    const before=await ctx.snapshot();expect((await ctx.api(method,path,{value:'forbidden',label:'Forbidden'},'staff')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
  });
});
