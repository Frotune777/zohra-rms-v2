const {integration}=require('./helpers/integration');
const ctx=integration();
const order=(changes={},key='checkout')=>ctx.api('POST','orders',{items:[{id:1,qty:1}],type:'Dine In',tableNumber:'12',...changes},'staff',{'Idempotency-Key':key});

describe('POS tables and optional customer phone',()=>{
  test.each(['owner','manager','staff'])('%s reads defaults without gaining configuration permissions',async role=>{
    const before=await ctx.snapshot();
    const response=await ctx.api('GET','tables',undefined,role);
    expect(response.status).toBe(200);expect(response.body).toEqual(Array.from({length:12},(_,index)=>({value:String(index+1),label:'Table '+(index+1)})));
    expect(await ctx.snapshot()).toEqual(before);
    if(role==='staff') expect((await ctx.api('GET','config/dining_tables',undefined,role)).status).toBe(403);
  });
  test('table catalog requires authentication',async()=>{
    expect((await ctx.api('GET','tables',undefined,null)).status).toBe(401);
  });
  test('configuration controls table labels, sort order and availability for staff',async()=>{
    const imported=await ctx.api('POST','config/dining_tables/bulk-import',{options:[{value:'12',label:'Patio 12',display_order:2},{value:'1',label:'Table 1',display_order:1}]});
    expect(imported.status).toBe(200);
    expect((await ctx.api('GET','tables',undefined,'staff')).body).toEqual([{value:'1',label:'Table 1'},{value:'12',label:'Patio 12'}]);
    for(const option of imported.body.options) expect((await ctx.api('PATCH','config/dining_tables/'+option.id+'/toggle',{})).status).toBe(200);
    expect((await ctx.api('GET','tables',undefined,'staff')).body).toEqual([]);
  });
  test.each(['Cash','Card','Due','Part'].flatMap(mode=>[undefined,null,'','   '].map(phone=>[mode,phone])))('%s checkout accepts phone %p with exact receivable, payment, customer and stock state',async(mode,phone)=>{
    const paid=mode==='Due'?0:mode==='Part'?50:250;
    const response=await order({paymentMode:mode,customerPhone:phone,...(mode==='Part'?{amountPaid:50,partialPaymentMode:'Cash'}:{})});
    expect(response.status).toBe(200);expect(response.body).toMatchObject({totalAmount:250,paidAmount:paid,outstanding:250-paid,order:{table_number:'12',customer_id:null,payment_status:mode==='Due'?'Due':mode==='Part'?'Part':'Paid'}});
    const {orderId}=response.body;
    expect(await ctx.rows('SELECT customer_id,table_number,total_amount,paid_amount FROM orders WHERE id=$1',[orderId])).toEqual([{customer_id:null,table_number:'12',total_amount:'250.00',paid_amount:paid.toFixed(2)}]);
    expect(await ctx.rows('SELECT id FROM customers')).toHaveLength(0);
    const payments=await ctx.rows('SELECT amount,payment_method FROM payment_transactions WHERE order_id=$1',[orderId]);
    expect(payments).toEqual(paid?[{amount:paid.toFixed(2),payment_method:mode==='Part'?'Cash':mode}]:[]);
    const lines=[{account:4000,debit:0,credit:250}];
    if(paid) lines.push({account:mode==='Card'?1010:1000,debit:paid,credit:0});
    if(paid<250) lines.push({account:1120,debit:250-paid,credit:0});
    await ctx.journal('POSOrder',orderId,lines);
    await ctx.journal('COGS',orderId,[{account:5000,debit:62.5,credit:0},{account:1200,debit:0,credit:62.5}]);
    expect((await ctx.rows('SELECT stock_qty,stock_value FROM inventory_items ORDER BY id')).map(item=>[Number(item.stock_qty),Number(item.stock_value)])).toEqual([[19.75,2962.5],[9.5,475]]);
    expect(await ctx.rows('SELECT order_id,status FROM kds_tickets')).toEqual([{order_id:orderId,status:'Pending'}]);
  });
  test('name-only customers remain distinct and their phone-free debts can be settled with retries',async()=>{
    const first=await order({customerName:'  Walk-in Guest  ',paymentMode:'Due'},'first');
    const second=await order({customerName:'Walk-in Guest',paymentMode:'Due'},'second');
    expect(first.status).toBe(200);expect(second.status).toBe(200);
    expect(first.body.order.customer_id).not.toBe(second.body.order.customer_id);
    expect(await ctx.rows('SELECT name,phone FROM customers ORDER BY id')).toEqual([{name:'Walk-in Guest',phone:null},{name:'Walk-in Guest',phone:null}]);
    const before=await ctx.snapshot();expect((await order({customerName:'  Walk-in Guest  ',paymentMode:'Due'},'first')).body).toEqual(first.body);expect(await ctx.snapshot()).toEqual(before);
    const payment=()=>ctx.api('POST','orders/'+first.body.orderId+'/payments',{amount:250,paymentMode:'Cash'},'staff',{'Idempotency-Key':'settle'});
    const settled=await payment();expect(settled.status).toBe(200);expect(settled.body.order).toMatchObject({payment_status:'Paid',paid_amount:'250.00'});
    const settledState=await ctx.snapshot();expect((await payment()).body).toEqual(settled.body);expect(await ctx.snapshot()).toEqual(settledState);
    await ctx.journal('OrderSettlement',settled.body.payment.id,[{account:1000,debit:250,credit:0},{account:1120,debit:0,credit:250}]);
    expect(await ctx.balance(1120)).toBe(250);
  });
  test('provided phones are trimmed and retain the existing customer lookup behavior',async()=>{
    const first=await order({customerPhone:' 9876500011 ',paymentMode:'Due'},'one');
    const second=await order({customerPhone:'9876500011',customerName:'Named Guest'},'two');
    expect(first.status).toBe(200);expect(second.status).toBe(200);
    expect(first.body.order.customer_id).toBe(second.body.order.customer_id);
    expect(await ctx.rows('SELECT name,phone FROM customers')).toEqual([{name:'Named Guest',phone:'9876500011'}]);
  });
  test.each(['Delivery','Pick Up'])('%s accepts phone-free debt and persists no table',async type=>{
    const response=await order({type,paymentMode:'Due'});expect(response.status).toBe(200);expect(response.body.order).toMatchObject({order_type:type,table_number:null,customer_id:null});
  });
  test.each([{customerPhone:123},{customerPhone:{}},{customerPhone:[]},{customerPhone:'1'.repeat(21)},{customerName:42},{customerName:'x'.repeat(101)},{tableNumber:12},{notes:{}}])('malformed optional fields %p reject every write atomically',async changes=>{
    const before=await ctx.snapshot();const response=await order({...changes,paymentMode:'Due'});expect(response.status).toBe(400);expect(response.body.error).toMatch(/must be text/);expect(await ctx.snapshot()).toEqual(before);
  });
  test('late kitchen failure rolls back a phone-free customer, debt and consumed stock',async()=>{
    await ctx.failOn('kds_tickets');const before=await ctx.snapshot();
    expect((await order({customerName:'Guest',paymentMode:'Part',amountPaid:50})).status).toBe(500);expect(await ctx.snapshot()).toEqual(before);
  });
});
