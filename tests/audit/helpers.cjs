const {expect}=require('./fixtures.cjs');
async function snapshot(audit,tables=['orders','order_items','payment_transactions','inventory_items',
  'inventory_transactions','stock_movements','bill_entries','vendor_payments','vendor_ledger',
  'transactions','journal_entries','ledger_lines','salary_history','salary_advances','advance_ledger','advance_requests','payroll_shortfalls','payroll_shortfall_settlements','wallet_transfer_history','stock_adjustments','stock_revaluations','advance_repayment_schedule','advance_schedule_allocations','stock_receipts','stock_corrections','advance_manual_allocations','advance_repayment_reversals','order_refunds']) {
  const state={};
  for(const table of tables) state[table]=(await audit.rows('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS data FROM '+table+' AS t'))[0].data;
  return state;
}
async function journal(audit,type,id,expectedLines) {
  const heads=await audit.rows('SELECT * FROM journal_entries WHERE reference_type=$1 AND reference_id=$2',[type,String(id)]);
  expect(heads,'Exactly one source-linked '+type+' journal').toHaveLength(1);
  const lines=await audit.rows('SELECT account_code,debit,credit FROM ledger_lines WHERE journal_entry_id=$1 ORDER BY account_code',[heads[0].id]);
  const actual=lines.map(l=>({account:l.account_code,debit:Number(l.debit),credit:Number(l.credit)}));
  audit.check('Journal '+type+' '+id,{header:heads[0],lines:actual});
  expect(actual).toEqual(expectedLines.sort((a,b)=>a.account-b.account));
  expect(actual.length).toBeGreaterThanOrEqual(2);
  expect(actual.reduce((sum,l)=>sum+Math.round(l.debit*100)-Math.round(l.credit*100),0)).toBe(0);
  return heads[0];
}
async function seedJournal(audit,{date=audit.DATE,description='Fixture',type='Fixture',id='fixture',lines}) {
  const [header]=await audit.rows('INSERT INTO journal_entries(transaction_date,description,reference_type,reference_id) VALUES($1,$2,$3,$4) RETURNING id',[date,description,type,String(id)]);
  for(const [account,debit,credit] of lines) await audit.pool.query('INSERT INTO ledger_lines(journal_entry_id,account_code,debit,credit) VALUES($1,$2,$3,$4)',[header.id,account,debit,credit]);
  return header.id;
}
async function billFixture(audit,{supplier=1,date=audit.DATE,qty=2,rate=160,status='Pending'}={}) {
  return (await audit.rows('INSERT INTO bill_entries(date,supplier_id,item_name,qty,vendor_rate,expected_rate,variance,status) VALUES($1,$2,$3,$4,$5,$5,0,$6) RETURNING *',[date,supplier,'Audit Chicken',qty,rate,status]))[0];
}
async function requestAdvance(audit,{employee=1,type='Advance',amount=1000,mode='Cash'}={}) {
  const response=await audit.api('POST','employees/payroll/advance',{employeeId:employee,type,amount,notes:'Audit advance',paymentMode:mode,paidBy:'Audit owner'});
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  return response.body.request;
}
async function payrollFixture(audit,{employee=1,month=11,year=2026,status='Approved',deduction=0,net=30000}={}) {
  return (await audit.rows('INSERT INTO salary_history(employee_id,month,year,days_worked,calculated_salary,advance_deduction,net_pay,status) VALUES($1,$2,$3,30,$4,$5,$6,$7) RETURNING *',[employee,month,year,net+deduction,deduction,net,status]))[0];
}
async function order(audit,overrides={}) {
  return audit.api('POST','orders',{items:[{id:1,name:'Audit Chicken Bowl',qty:1,price:250}],paymentMethod:'Cash',...overrides});
}
async function raceWrites(audit,table,operations) {
  if(!['vendor_payments','purchase_order_items','bill_entries','chart_of_accounts','employees','advance_ledger'].includes(table))throw new Error('Unsupported barrier table');
  await audit.pool.query('CREATE FUNCTION audit_write_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(5543901); RETURN NEW; END $$');
  await audit.pool.query('CREATE TRIGGER audit_write_gate BEFORE INSERT ON '+table+' FOR EACH ROW EXECUTE FUNCTION audit_write_gate()');
  const lock=await audit.pool.connect();
  let pending;
  try {
    await lock.query('SELECT pg_advisory_lock(5543901)');
    pending=Promise.all(operations.map(fn=>fn()));
    await expect.poll(async()=>Number((await audit.rows("SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'"))[0].count),{timeout:5000}).toBeGreaterThanOrEqual(1);
    // Observe two in-flight writers. A correct row lock may block one earlier.
    await expect.poll(async()=>Number((await audit.rows("SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'"))[0].count),{timeout:5000}).toBeGreaterThanOrEqual(2);
  }finally{await lock.query('SELECT pg_advisory_unlock(5543901)');lock.release();}
  return pending;
}
module.exports={snapshot,journal,seedJournal,billFixture,requestAdvance,payrollFixture,order,raceWrites};
