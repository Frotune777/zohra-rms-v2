const {test,expect}=require('./fixtures.cjs');
const bcrypt=require('../../server/node_modules/bcryptjs');
test('AUTH-002 wrong passwords, unknown users and omitted fields never create a session',async({audit,page})=>{
  for(const [data,status] of [[{email:'owner@audit.invalid',password:'wrong'},401],
    [{email:'missing@audit.invalid',password:audit.PASSWORD},401],[{email:'owner@audit.invalid'},400],[{password:audit.PASSWORD},400]]) {
    const r=await audit.api('POST','auth/login',data,null);
    expect(r.status).toBe(status);expect(r.body.token).toBeUndefined();
  }
  await page.goto('/login');await page.locator('input[type=email]').fill('owner@audit.invalid');
  await page.locator('input[type=password]').fill('wrong');await page.locator('button[type=submit]').click();
  await expect(page.getByText('Invalid credentials',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('token'))).toBeNull();
});
test('AUTH-003 changed passwords invalidate every default demo password',async({audit})=>{
  for(const role of ['owner','manager','staff']) {
    await audit.pool.query('INSERT INTO users(email,password_hash,full_name,role) VALUES($1,$2,$3,$4)',
      [role+'@alzohra.com',await bcrypt.hash(audit.PASSWORD,4),'Changed '+role,role]);
    const old=await audit.api('POST','auth/login',{email:role+'@alzohra.com',password:role+'123'},null);
    expect.soft(old.status,role+' old password').toBe(401);expect.soft(old.body.token).toBeUndefined();
    const current=await audit.api('POST','auth/login',{email:role+'@alzohra.com',password:audit.PASSWORD},null);
    expect(current.status).toBe(200);
  }
});
test('AUTH-004 inactive and deleted accounts lose login and existing-token access',async({audit})=>{
  await audit.pool.query("UPDATE users SET status='inactive' WHERE email='manager@audit.invalid'");
  expect.soft((await audit.api('POST','auth/login',{email:'manager@audit.invalid',password:audit.PASSWORD},null)).status).toBe(403);
  expect.soft((await audit.api('GET','finance/pnl',undefined,'manager')).status).toBe(403);
  await audit.pool.query("DELETE FROM users WHERE email='manager@audit.invalid'");
  expect.soft((await audit.api('GET','finance/pnl',undefined,'manager')).status).toBe(403);
});
test('AUTH-005 malformed, expired, wrong-signature and wrong-scheme JWTs are rejected',async({audit})=>{
  expect((await audit.api('GET','finance/pnl',undefined,null)).status).toBe(401);
  for(const token of ['garbage','a.b.c',audit.sign({...audit.actors.owner.user,exp:1794225500}),
    require('../../server/node_modules/jsonwebtoken').sign(audit.actors.owner.user,'wrong-secret')])
    expect((await audit.api('GET','finance/pnl',undefined,null,{Authorization:'Bearer '+token})).status).toBe(403);
  expect.soft((await audit.api('GET','finance/pnl',undefined,null,{Authorization:'Basic '+audit.actors.owner.token})).status).toBe(401);
});
test('AUTH-006 staff cannot open sensitive pages directly or read their APIs',async({audit,page})=>{
  await audit.session(page,'staff');
  for(const [url,heading] of [['/finance','Financial Dashboard'],['/payroll','Payroll Automation'],['/config','Configuration Management'],['/reports/financial','Financial Reports']]) {
    await page.goto(url);await page.waitForLoadState('networkidle');
    const body=await page.locator('body').innerText();
    expect.soft(body,'Staff direct access '+url).not.toContain(heading);
  }
  for(const endpoint of ['finance/pnl','payroll/monthly?month=11&year=2026','config/payment_mode','reports/financial/overview'])
    expect.soft((await audit.api('GET',endpoint,undefined,'staff')).status,endpoint).toBe(403);
});
test('AUTH-007 manager cannot create owners and staff cannot register accounts',async({audit})=>{
  const body={email:'escalated@audit.invalid',password:audit.PASSWORD,full_name:'Escalated owner',role:'owner'};
  expect.soft((await audit.api('POST','auth/register',body,'manager')).status).toBe(403);
  expect.soft((await audit.rows('SELECT id FROM users WHERE email=$1',[body.email]))).toHaveLength(0);
  expect((await audit.api('POST','auth/register',{...body,email:'staff-escalated@audit.invalid'},'staff')).status).toBe(403);
});
test('AUTH-008 duplicate and concurrent registration preserve unique users and wallet accounts',async({audit})=>{
  const body={email:'new@audit.invalid',password:audit.PASSWORD,full_name:'New staff',role:'staff'};
  expect((await audit.api('POST','auth/register',body)).status).toBe(200);
  expect((await audit.api('POST','auth/register',body)).status).toBe(400);
  const replies=await Promise.all(['a','b'].map(s=>audit.api('POST','auth/register',{...body,email:s+'@audit.invalid',full_name:'Concurrent '+s})));
  expect.soft(replies.map(r=>r.status)).toEqual([200,200]);
  const rows=await audit.rows("SELECT u.email,u.ledger_account_code,ca.name FROM users u LEFT JOIN chart_of_accounts ca ON ca.code=u.ledger_account_code WHERE u.email IN ('a@audit.invalid','b@audit.invalid')");
  expect.soft(rows).toHaveLength(2);expect.soft(new Set(rows.map(r=>r.ledger_account_code)).size).toBe(2);
  expect.soft(rows.every(r=>r.name)).toBe(true);
});
test('AUTH-009 a cleared session stays logged out after reload and a second tab',async({audit,page,context})=>{
  await audit.login(page);await page.evaluate(()=>localStorage.removeItem('token'));
  await page.reload();await expect(page).toHaveURL('http://127.0.0.1:33129/login');
  const tab=await context.newPage();await tab.goto('/finance');await expect(tab).toHaveURL('http://127.0.0.1:33129/login');
});
test('AUTH-010 all financial, HR, operational and inventory reports enforce authentication',async({audit})=>{
  const routes=require('../../docs/audit/repository-inventory.json').server_route_registrations.filter(r=>r.file==='server/src/modules/reports/routes.js');
  expect(routes).toHaveLength(12);
  for(const route of routes) {
    const path='reports'+route.path;
    expect.soft((await audit.api('GET',path,undefined,null)).status,'Anonymous '+path).toBe(401);
    expect.soft((await audit.api('GET',path,undefined,'staff')).status,'Staff '+path).toBe(403);
  }
});
test('AUTH-011 an unlisted browser origin receives no credentialed CORS authorization',async({audit})=>{
  const r=await audit.api('GET','auth/me',undefined,'owner',{Origin:'https://untrusted.example.invalid'});
  expect(r.response.headers()['access-control-allow-origin']).toBeUndefined();
});
test('AUTH-011 unauthenticated kitchen sockets cannot connect',async({audit,page})=>{
  await page.goto('/login');await page.addScriptTag({url:'http://127.0.0.1:33130/socket.io/socket.io.js'});
  const outcome=await page.evaluate(()=>new Promise(resolve=>{
    const socket=window.io('http://127.0.0.1:33130',{transports:['websocket'],reconnection:false});
    const timer=setTimeout(()=>{socket.disconnect();resolve('timeout');},3000);
    socket.on('connect',()=>{clearTimeout(timer);socket.emit('join_kitchen');socket.disconnect();resolve('connected');});
    socket.on('connect_error',()=>{clearTimeout(timer);socket.disconnect();resolve('denied');});
  }));
  expect(outcome).toBe('denied');
});
