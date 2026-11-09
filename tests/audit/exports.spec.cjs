const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {test,expect}=require('./fixtures.cjs');
const {seedJournal,billFixture}=require('./helpers.cjs');
const cases=['/reports/financial','/reports/hr','/reports/operations','/reports/inventory'];
async function ready(audit,page,url){await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));await audit.session(page);await page.goto(url);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeVisible();}
async function download(page,format){await page.getByRole('button',{name:'Export',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export as '+format,exact:true}).click();const d=await pending;return {name:d.suggestedFilename(),content:fs.readFileSync(await d.path(),'utf8')};}
test('EXPORT-001 CSV preserves quotes, Unicode and embedded newlines without executable formula cells',async({audit,page})=>{
  await audit.pool.query('UPDATE inventory_items SET name=$1 WHERE id=1',['=1+1']);await audit.pool.query('UPDATE inventory_items SET name=$1 WHERE id=2',['Zohra, "रसोई"\nSecond line']);
  await ready(audit,page,'/reports/inventory');const d=await download(page,'CSV');audit.check('CSV content',d);
  expect.soft(d.content).toContain('"Zohra, ""रसोई""\nSecond line"');expect(d.content.split('\n').some(line=>/^\d+,=1\+1,/.test(line))).toBe(false);
});
for(const url of cases)
  test('EXPORT-002 '+url+' JSON download matches the report input',async({audit,page})=>{
    await seedJournal(audit,{lines:[[1000,100,0],[4000,0,100]]});await seedJournal(audit,{lines:[[6000,50,0],[1000,0,50]]});
    await audit.pool.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,balance_after,transaction_date) VALUES(1,'Advance',1000,1000,'2026-11-09')");await billFixture(audit);
    await ready(audit,page,url);const d=await download(page,'JSON');expect(d.name).toMatch(/_2026-11-09\.json$/);
    const value=JSON.parse(d.content);audit.check('JSON content',value);
    if(url==='/reports/inventory'){expect(value).toHaveLength(2);expect(value.map(r=>r.name).sort()).toEqual(['Audit Chicken','Audit Rice']);}
    else if(url==='/reports/financial')expect(value).toEqual([{date:await page.evaluate(()=>new Date('2026-11-09').toLocaleDateString('en-IN',{month:'short',day:'numeric'})),revenue:100,expenses:50}]);
    else {const endpoint=url==='/reports/hr'?'reports/hr/advances':'reports/operations/chicken-analytics';const actual=await audit.api('GET',endpoint+'?startDate=2026-10-10&endDate=2026-11-09');expect(value).toEqual(url==='/reports/hr'?actual.body.advances:actual.body.itemSummary);expect(value.length).toBeGreaterThan(0);}
  });
for(const url of cases)
  test('EXPORT-003 '+url+' PDF downloads parse and contain report values',async({audit,page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await seedJournal(audit,{lines:[[1000,100,0],[4000,0,100]]});await seedJournal(audit,{lines:[[6000,50,0],[1000,0,50]]});await billFixture(audit);
    await audit.pool.query("INSERT INTO advance_ledger(employee_id,transaction_type,amount,balance_after,transaction_date) VALUES(1,'Advance',1000,1000,'2026-11-09')");
    await ready(audit,page,url);await page.getByRole('button',{name:'Export',exact:true}).click();const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Export as PDF',exact:true}).click();const d=await waiting;
    expect(d.suggestedFilename()).toMatch(/_2026-11-09.pdf$/);const file=await d.path();expect(fs.readFileSync(file).subarray(0,5).toString()).toBe('%PDF-');
    const parsed=JSON.parse(execFileSync(path.resolve('.venv/bin/python'),['scripts/extract-audit-pdf.py',file],{encoding:'utf8'}));audit.check('PDF contents',parsed);
    expect(parsed.pages).toBeGreaterThan(0);expect(parsed.text).toContain('Generated 2026-11-09');
    expect(parsed.text).toContain(url==='/reports/inventory'?'Audit Chicken':url==='/reports/hr'?'1000':url==='/reports/financial'?'100':'Audit Chicken');expect(errors).toEqual([]);
  });
test('EXPORT-003 repeated downloads release their Blob URLs',async({audit,page})=>{
  await page.addInitScript(()=>{window.auditUrls={created:0,revoked:0};const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(...args)=>{window.auditUrls.created++;return create(...args)};URL.revokeObjectURL=(...args)=>{window.auditUrls.revoked++;return revoke(...args)};});
  await ready(audit,page,'/reports/inventory');for(let i=0;i<2;i++)await download(page,'JSON');expect(await page.evaluate(()=>window.auditUrls)).toEqual({created:2,revoked:2});
});
