const {test,expect}=require('./fixtures.cjs');
const screens=require('./screens.cjs');
for(const [id,url,title] of screens){
  test(id+' empty business data renders without an uncaught exception '+url,async({audit,page})=>{
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));await audit.session(page);
    await audit.pool.query('TRUNCATE orders,menu_items,inventory_items,suppliers,salary_history,advance_ledger,attendance,leave_requests,bill_entries,transactions,journal_entries,ledger_lines,kds_tickets,purchase_orders,wastage_logs CASCADE');
    await audit.pool.query('UPDATE users SET employee_id=NULL');await audit.pool.query('DELETE FROM employees');
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForLoadState('networkidle');
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();expect(errors).toEqual([]);
    audit.check('Empty business rendering',{title,errors});
  });
  test(id+' delayed API completion preserves navigation and renders '+url,async({audit,page})=>{
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));await audit.session(page);
    let release;const gate=new Promise(resolve=>release=resolve);const requested=[];
    await page.route('**/api/**',async route=>{requested.push(route.request().url());await gate;await route.continue();});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{await page.goto(url);await expect(page.locator('body')).not.toBeEmpty();audit.check('Pending API requests',requested);}
    finally{release();}
    await page.waitForLoadState('networkidle');await expect(page.getByText(title,{exact:true}).first()).toBeVisible();expect(errors).toEqual([]);
  });
  test(id+' failed data requests show feedback and recover after reload '+url,async({audit,page},info)=>{
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));await audit.session(page);
    const failures=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',route=>{if(route.request().url().includes('/api/auth/'))return route.continue();failures.push(route.request().url());return route.fulfill({status:500,json:{error:'Audit injected server failure'}});});
    await page.goto(url);await page.waitForLoadState('networkidle');
    if(failures.length)await expect.soft(page.getByText(/failed|error|unable|try again/i).first()).toBeVisible();
    else info.annotations.push({type:'scope',description:'Static screen has no initial data requests; submit/error flows are covered separately.'});
    audit.check('Injected HTTP failures',failures);await page.unroute('**/api/**');await page.reload();await page.waitForLoadState('networkidle');
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();expect(errors).toEqual([]);
  });
  test('UI-001 '+id+' visible buttons and form fields have programmatic accessible names '+url,async({audit,page})=>{
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));await audit.session(page);await page.goto(url);await page.waitForLoadState('networkidle');
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
    const nameless=await page.locator('button,input:not([type=hidden]),select,textarea').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length&&!e.disabled).filter(e=>{
      const labelled=e.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();
      const labels=e.labels&&Array.from(e.labels).some(l=>l.textContent.trim());
      return !(e.getAttribute('aria-label')?.trim()||labelled||labels||e.getAttribute('title')?.trim()||e.tagName==='BUTTON'&&e.textContent.trim());
    }).map(e=>({tag:e.tagName,type:e.getAttribute('type'),id:e.id,placeholder:e.getAttribute('placeholder'),text:e.textContent.trim().slice(0,60)})));
    audit.check('Controls missing accessible names',nameless);expect(nameless).toEqual([]);
  });
}
test('UI-002 long inventory names remain within scrollable content on mobile',async({audit,page})=>{
  const name='LongAuditName'.repeat(8).slice(0,100);
  await audit.pool.query('UPDATE inventory_items SET name=$1 WHERE id=1',[name]);await audit.session(page);await page.setViewportSize({width:375,height:812});await page.goto('/inventory');
  await expect(page.getByText(name,{exact:true})).toBeVisible();
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);
  audit.check('Valid long-name mobile layout',{name_length:name.length,viewport:375,document_width:width});
  expect(width).toBeLessThanOrEqual(376);
});
test('UI-003 failed employee creation preserves entered form values for retry',async({audit,page})=>{
  await audit.session(page);await page.goto('/employees');await page.getByRole('button',{name:'Register New Employee',exact:true}).click();
  const name=page.getByPlaceholder('John',{exact:true});await name.fill('Preserved');await page.getByPlaceholder('Doe',{exact:true}).fill('Audit');
  await page.getByPlaceholder('25000',{exact:true}).fill('1000');
  await page.getByPlaceholder('Kitchen, Service, etc.',{exact:true}).fill('Kitchen');
  await page.getByPlaceholder('Chef, Waiter, etc.',{exact:true}).fill('Cook');
  await page.route('**/api/employees',route=>route.request().method()==='POST'?route.fulfill({status:500,json:{error:'Audit retry'}}):route.continue());
  const request=page.waitForResponse(r=>r.url().endsWith('/api/employees')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Register Employee',exact:true}).click();expect((await request).status()).toBe(500);await expect(name).toHaveValue('Preserved');
});
