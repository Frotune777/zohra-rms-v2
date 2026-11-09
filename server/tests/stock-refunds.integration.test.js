const {integration}=require('./helpers/integration');
const ctx=integration();
const stock=()=>ctx.rows('SELECT stock_qty,stock_value,unit_cost FROM inventory_items ORDER BY id');
const order=(patch={})=>ctx.api('POST','orders',{items:[{id:1,qty:1}],paymentMethod:'Cash',...patch},'staff',{'Idempotency-Key':'sale'});
const refund=(id,patch={},key='refund',role='owner')=>ctx.api('POST','orders/'+id+'/refund',{reason:'Wrong order',returnStock:true,...patch},role,key?{'Idempotency-Key':key}:{});
const adjustment=(patch={})=>ctx.api('POST','inventory/adjustments',{inventory_item_id:1,quantity_change:-.25,reason:'Count correction',...patch});

describe('Recipe replacement and inventory adjustments preserve exact state',()=>{
  test('recipe replacement and clearing change only the selected menu and report independent recipe cost',async()=>{
    expect((await ctx.api('PUT','inventory/recipes/1',{ingredients:[{inventory_item_id:2,quantity_required:.25}]})).status).toBe(200);
    expect((await ctx.api('GET','inventory/recipes')).body.find(r=>r.id===1)).toMatchObject({recipe_cost:'12.500000',ingredients:[{inventory_item_id:2,quantity_required:.25}]});
    expect((await ctx.rows('SELECT menu_item_id,inventory_item_id FROM recipe_ingredients ORDER BY menu_item_id'))).toEqual([{menu_item_id:1,inventory_item_id:2},{menu_item_id:2,inventory_item_id:2}]);
    expect((await ctx.api('PUT','inventory/recipes/1',{ingredients:[]})).status).toBe(200);expect((await ctx.api('GET','inventory/recipes')).body.find(r=>r.id===1).ingredients).toEqual([]);
  });
  test.each([undefined,[{inventory_item_id:1,quantity_required:0}],[{inventory_item_id:1,quantity_required:.00001}],[{inventory_item_id:99999,quantity_required:1}],[{inventory_item_id:1,quantity_required:1},{inventory_item_id:'1',quantity_required:1}]])('invalid recipe %p leaves the original usable recipe intact',async ingredients=>{
    const before=await ctx.snapshot();expect((await ctx.api('PUT','inventory/recipes/1',{ingredients})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('unknown menu and late ingredient insertion failure restore deleted ingredients',async()=>{
    let before=await ctx.snapshot();expect((await ctx.api('PUT','inventory/recipes/99999',{ingredients:[]})).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
    await ctx.failOn('recipe_ingredients','INSERT','NEW.inventory_item_id=2');before=await ctx.snapshot();
    expect((await ctx.api('PUT','inventory/recipes/1',{ingredients:[{inventory_item_id:1,quantity_required:.5},{inventory_item_id:2,quantity_required:.25}]})).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each([[-.25,-37.5],[.25,37.5],[-20,-3000]])('adjustment %p records before/after quantity and exact value %p',async(qty,value)=>{
    const result=await adjustment({quantity_change:qty});expect(result.status).toBe(200);expect(result.body).toMatchObject({quantity_before:'20.0000',quantity_after:(20+qty).toFixed(4),value_change:value,created_by:ctx.actors.owner.id});
    expect((await stock())[0].stock_value).toBe((3000+value).toFixed(2));
    await ctx.journal('StockAdjustment',result.body.id,qty>0?[{account:1200,debit:value,credit:0},{account:6200,debit:0,credit:value}]:[{account:6200,debit:-value,credit:0},{account:1200,debit:0,credit:-value}]);
  });
  test.each([{quantity_change:0},{quantity_change:-21},{quantity_change:'bad'},{quantity_change:.000001},{reason:''},{inventory_item_id:99999}])('invalid adjustment %p leaves stock and journals unchanged',async patch=>{
    const before=await ctx.snapshot();expect((await adjustment(patch)).status).toBe(patch.inventory_item_id===99999?404:400);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['ledger_lines','stock_movements','inventory_transactions'])('late adjustment failure at %s restores source, quantity and value',async table=>{
    await ctx.failOn(table);const before=await ctx.snapshot();const result=await adjustment();expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['adjustment','wastage'])('%s correction uses its recorded value after a subsequent higher-price receipt',async kind=>{
    const path=kind==='adjustment'?'inventory/adjustments':'wastage';
    const source=kind==='adjustment'?await adjustment():await ctx.api('POST',path,{inventory_item_id:1,qty:.25,reason:'Spilled'});expect(source.status).toBe(200);
    const po=await ctx.api('POST','inventory/po',{supplier_id:1,items:[{inventory_item_id:1,qty:2,unit_cost:200}]});expect((await ctx.api('PUT','inventory/po/'+po.body.id+'/status',{status:'Received'})).status).toBe(200);
    const result=await ctx.api('POST',path+'/'+source.body.id+'/reverse',{reason:'Recording error'});expect(result.status).toBe(200);expect(result.body).toMatchObject({quantity_change:'0.2500',value_change:'37.50',created_by:ctx.actors.owner.id});
    expect((await stock())[0]).toMatchObject({stock_qty:'22.0000',stock_value:'3400.00'});
    const before=await ctx.snapshot();expect((await ctx.api('POST',path+'/'+source.body.id+'/reverse',{reason:'Recording error'})).status).toBe(200);expect(await ctx.snapshot()).toEqual(before);
    expect((await ctx.api('POST',path+'/'+source.body.id+'/reverse',{reason:'Different'})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test('correction rejects unavailable source, blank reason, quantity deficit and late movement failure',async()=>{
    const source=await adjustment({quantity_change:5});await adjustment({quantity_change:-23});let before=await ctx.snapshot();
    expect((await ctx.api('POST','inventory/adjustments/99999/reverse',{reason:'Missing'})).status).toBe(404);expect((await ctx.api('POST','inventory/adjustments/'+source.body.id+'/reverse',{reason:''})).status).toBe(400);expect((await ctx.api('POST','inventory/adjustments/'+source.body.id+'/reverse',{reason:'Undo addition'})).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
    const negative=await adjustment({quantity_change:-1});await ctx.failOn('stock_movements');before=await ctx.snapshot();expect((await ctx.api('POST','inventory/adjustments/'+negative.body.id+'/reverse',{reason:'Wrong count'})).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
});
describe('Full order refunds: payments, stock return, preparation and atomic failures',()=>{
  test.each(['Cash','Due','Part'])('%s refund cancels receipts and remaining receivable and returns unused ingredients',async mode=>{
    const sale=await order({paymentMethod:mode,amountPaid:20,customerPhone:'1234567890'});expect(sale.status).toBe(200);
    if(mode!=='Cash')expect((await ctx.api('POST','orders/'+sale.body.orderId+'/payments',{amount:20,paymentMode:'Card'},'staff',{'Idempotency-Key':'collect'})).status).toBe(200);
    expect((await stock())[0]).toMatchObject({stock_qty:'19.7500',stock_value:'2962.50'});
    const result=await refund(sale.body.orderId);expect(result.status).toBe(200);expect(result.body.refund.created_by).toBe(ctx.actors.owner.id);expect(Number(result.body.refund.amount)).toBe(mode==='Cash'?250:mode==='Part'?40:20);
    expect((await stock()).map(i=>[i.stock_qty,i.stock_value])).toEqual([['20.0000','3000.00'],['10.0000','500.00']]);
    for(const account of [1000,1010,1120,1200,4000,2100,5000])expect(await ctx.balance(account)).toBe(0);
    expect(await ctx.rows('SELECT status,payment_status FROM orders')).toEqual([{status:'Cancelled',payment_status:'Refunded'}]);expect((await ctx.rows('SELECT status FROM payment_transactions')).every(p=>p.status==='Refunded')).toBe(true);
    const before=await ctx.snapshot();expect((await refund(sale.body.orderId)).body).toEqual(result.body);expect(await ctx.snapshot()).toEqual(before);expect((await refund(sale.body.orderId,{reason:'Different'})).status).toBe(409);expect((await refund(sale.body.orderId,{},'other-key')).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['Preparing','Done'])('refund at %s rejects stock return and preserves consumed stock when return declined',async status=>{
    const sale=await order();await ctx.pool.query('UPDATE kds_tickets SET status=$1',[status]);let before=await ctx.snapshot();
    expect((await refund(sale.body.orderId)).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
    expect((await refund(sale.body.orderId,{returnStock:false},'cooked')).status).toBe(200);expect((await stock())[0]).toMatchObject({stock_qty:'19.7500',stock_value:'2962.50'});expect(await ctx.balance(5000)).toBe(62.5);expect(await ctx.balance(1000)).toBe(0);
  });
  test.each([{reason:''},{returnStock:undefined},{returnStock:'true'}])('invalid refund %p has no effect',async patch=>{
    const sale=await order();const before=await ctx.snapshot();expect((await refund(sale.body.orderId,patch)).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
  test('missing key and source reject; missing preparation ticket forbids return',async()=>{
    const sale=await order();let before=await ctx.snapshot();expect((await refund(sale.body.orderId,{},null)).status).toBe(400);expect((await refund(99999)).status).toBe(404);expect(await ctx.snapshot()).toEqual(before);
    await ctx.pool.query('DELETE FROM kds_tickets');before=await ctx.snapshot();expect((await refund(sale.body.orderId)).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['payments','journals','valuation'])('inconsistent %s history rejects a refund without partial reversals',async kind=>{
    const sale=await order();
    if(kind==='payments')await ctx.pool.query('UPDATE payment_transactions SET amount=1');
    if(kind==='journals'){await ctx.pool.query("UPDATE journal_entries SET reference_type='MissingSource' WHERE reference_type='POSOrder'");await ctx.pool.query('UPDATE payment_transactions SET journal_entry_id=NULL');}
    if(kind==='valuation')await ctx.pool.query("UPDATE inventory_transactions SET value_change=NULL WHERE reference_type='Order'");
    const before=await ctx.snapshot();expect((await refund(sale.body.orderId)).status).toBe(409);expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['stock_corrections','stock_movements','payment_transactions','orders','operation_keys'])('late refund failure at %s restores every payment, stock and journal change',async table=>{
    const sale=await order();await ctx.failOn(table,['payment_transactions','orders'].includes(table)?'UPDATE':'INSERT');const before=await ctx.snapshot();
    const result=await refund(sale.body.orderId);expect(result.status).toBe(500);expect(result.body.error).toContain('Jest forced failure');expect(await ctx.snapshot()).toEqual(before);
  });
  test.each(['Locked','Closed'])('%s period and staff role block stock corrections and refunds',async status=>{
    const sale=await order();const source=await adjustment();let before=await ctx.snapshot();
    expect((await refund(sale.body.orderId,{},'staff','staff')).status).toBe(403);expect((await ctx.api('POST','inventory/adjustments/'+source.body.id+'/reverse',{reason:'Wrong'},'staff')).status).toBe(403);expect(await ctx.snapshot()).toEqual(before);
    await ctx.closedPeriod(status);before=await ctx.snapshot();expect((await refund(sale.body.orderId)).status).toBe(400);expect((await ctx.api('POST','inventory/adjustments/'+source.body.id+'/reverse',{reason:'Wrong'})).status).toBe(400);expect(await ctx.snapshot()).toEqual(before);
  });
});
