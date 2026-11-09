const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const XLSX=require('../../server/node_modules/xlsx');
const {test,expect}=require('./fixtures.cjs');
const {root,guard}=require('./database.cjs');
const {snapshot,requestAdvance,order}=require('./helpers.cjs');
function workbook(file,type='xlsx'){
  const book=XLSX.utils.book_new();
  for(const [name,rows] of [['EMP List',[['Name','Role','Department','Salary','Key'],['Synthetic Import Employee','Cook','Kitchen',12345,'AUDIT-IMPORT']]],['Paper Rate',[['Date','Tandoor','Boiler','Egg'],[new Date('2026-10-15T00:00:00Z'),150,100,6]]],['Chicken Daily weight',[['Date','Tandoori'],[new Date('2026-10-15T00:00:00Z'),2]]],['Nov-2026',[['Synthetic attendance'],['','','','','',1,2],[],[],['AUDIT-IMPORT','Synthetic Import Employee','','Cook','Kitchen','Present','Half-Day']]]])XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
  XLSX.writeFile(book,file,{bookType:type==='xls'?'biff8':'xlsx'});
}
async function importer(audit,steps){
  guard(audit.url);const child=spawn(path.join(root,'.venv/bin/python'),[path.join(__dirname,'import-runner.py')],{cwd:root,env:{...process.env,DATABASE_URL:audit.url},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Importer process '+code+': '+stderr)));});
  child.stdin.end(JSON.stringify({steps}));await done;const line=stdout.split('\n').find(l=>l.startsWith('AUDIT_RESULT '));if(!line)throw new Error('Missing importer result: '+stderr);
  const result=JSON.parse(line.slice(13));audit.check('Importer result',{result,stderr});return result;
}
for(const type of ['xls','xlsx'])test('DATA-001 synthetic '+type+' employee/rates/attendance round trip is repeatable',async({audit},info)=>{
  const file=info.outputPath('synthetic.'+type);workbook(file,type);
  const steps=['migrate_employees','migrate_chicken_rates','migrate_attendance'].map(method=>({method,file}));
  const first=await importer(audit,steps);expect(first.ok).toBe(true);expect(first.discrepancies).toEqual([]);
  const before=await snapshot(audit,['employees','daily_rates','attendance']);const second=await importer(audit,steps);expect(second.ok).toBe(true);expect(second.discrepancies).toEqual([]);
  const stable=value=>JSON.parse(JSON.stringify(value,(key,val)=>key==='updated_at'?undefined:val));
  expect(stable(await snapshot(audit,['employees','daily_rates','attendance']))).toEqual(stable(before));expect(await audit.rows("SELECT id FROM employees WHERE full_name='Synthetic Import Employee'")).toHaveLength(1);
  expect((await audit.rows("SELECT a.status FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE e.full_name='Synthetic Import Employee' ORDER BY date")).map(a=>a.status)).toEqual(['Present','Half-Day']);
});
test('DATA-001 repeated bill import does not duplicate financial source rows',async({audit},info)=>{
  const file=info.outputPath('synthetic.xlsx');workbook(file);const steps=[{method:'migrate_vendor_bills',file}];
  expect((await importer(audit,steps)).ok).toBe(true);const before=await snapshot(audit,['bill_entries']);expect((await importer(audit,steps)).ok).toBe(true);expect(await snapshot(audit,['bill_entries'])).toEqual(before);
});
test('DATA-001 repeated CSV import is idempotent and malformed source rows are reported',async({audit},info)=>{
  const file=info.outputPath('synthetic.csv');fs.writeFileSync(file,'Date,Category,Amount,Item/Description,Remarks\n09/11/2026,Sales,100,Synthetic Sale,Audit\ninvalid,Sales,200,Bad Date,Audit\n09/11/2026,Expense,bad,Bad Amount,Audit\n');
  const steps=[{method:'migrate_ledger',file}];const first=await importer(audit,steps);expect.soft(first.discrepancies.length).toBeGreaterThan(0);
  const before=await snapshot(audit,['journal_entries','ledger_lines']);expect((await importer(audit,steps)).ok).toBe(true);expect(await snapshot(audit,['journal_entries','ledger_lines'])).toEqual(before);
});
test('DATA-001 missing attendance is reported before changing active employee statuses',async({audit},info)=>{
  const before=await snapshot(audit,['employees','employee_history']);const result=await importer(audit,[{method:'migrate_attendance',file:info.outputPath('nonexistent.xlsx')},{method:'sync_employee_statuses'}]);
  expect.soft(result.discrepancies.length).toBeGreaterThan(0);expect(await snapshot(audit,['employees','employee_history'])).toEqual(before);
});
test('E2E-002 purchase approval settlement and closure reconcile after each committed stage',async({audit})=>{
  const r=await audit.api('POST','chicken/bills',{date:audit.DATE,supplier_id:1,item_name:'Audit Chicken',qty:2,vendor_rate:160});expect(r.status).toBe(200);
  const stored=await audit.rows('SELECT * FROM bill_entries WHERE id=$1',[r.body.id]);expect(stored,'Purchase must commit before subsequent stages').toHaveLength(1);
  audit.check('Stage committed purchase',stored);
  expect((await audit.api('PATCH','chicken/bills/'+stored[0].id+'/status',{status:'Approved'})).status).toBe(200);
  for(const amount of [100,220])expect((await audit.api('POST','vendors/payments',{vendorId:1,amount,paymentMode:'Cash',paidBy:'Audit owner',notes:'Round trip'})).status).toBe(200);
  expect(Number((await audit.rows("SELECT COALESCE(sum(CASE WHEN transaction_type='Bill' THEN amount ELSE -amount END),0) AS amount FROM vendor_ledger WHERE supplier_id=1"))[0].amount)).toBe(0);
  await audit.api('GET','finance/daily-balance/'+audit.DATE);await audit.api('GET','finance/daily-balance/'+audit.DATE);
  expect((await audit.api('POST','finance/daily-balance/close',{date:audit.DATE,type:'Counter',actualClosingBalance:-320})).status).toBe(200);
  expect((await audit.api('POST','finance/daily-balance/reopen',{date:audit.DATE,type:'Counter',reason:'Round trip'})).status).toBe(200);
});
test('E2E-003 attendance advance payroll payout revert and repay conserve source balances',async({audit})=>{
  expect((await audit.api('POST','attendance/bulk',{date:audit.DATE,records:[{employee_id:1,status:'Present'}]})).status).toBe(200);
  const request=await requestAdvance(audit,{amount:1000});expect((await audit.api('POST','employees/payroll/requests/'+request.id+'/approve',{})).status).toBe(200);
  const run=await audit.api('POST','payroll/run',{employeeId:1,month:11,year:2026,daysWorked:1,advanceDeduction:500});expect(run.status).toBe(200);const salary=run.body.data[0];
  expect((await audit.api('POST','payroll/approve',{id:salary.id})).status).toBe(200);
  expect((await audit.api('POST','payroll/payout',{id:salary.id,payment_mode:'Cash',paid_by:1,payment_date:audit.DATE})).status).toBe(200);
  audit.check('Stage payout balances',await audit.rows('SELECT account_code,sum(debit-credit) AS balance FROM ledger_lines GROUP BY account_code ORDER BY account_code'));
  expect((await audit.api('POST','payroll/revert/'+salary.id,{targetStatus:'Approved',reason:'Audit round trip'})).status).toBe(200);
  expect.soft((await audit.api('GET','employees/payroll/advances/1/balance')).body.balance).toBe(1000);
  expect(Number((await audit.rows('SELECT sum(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000'))[0].balance)).toBe(-1000);
});
