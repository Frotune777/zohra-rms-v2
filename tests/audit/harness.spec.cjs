const {test,expect}=require('./fixtures.cjs');
const {guard,bootstrap,migrations}=require('./database.cjs');
test('E2E-001 rejects application, remote, alternate-user and alternate-port targets',async()=>{
  for(const url of ['postgresql://admin:password@localhost:5432/alzohra_db',
    'postgresql://zohra_audit@127.0.0.1:55439/alzohra_db',
    'postgresql://zohra_audit@remote.invalid:55439/zohra_pw_test',
    'postgresql://admin@127.0.0.1:55439/zohra_pw_test',
    'postgresql://zohra_audit@127.0.0.1:5432/zohra_pw_test']) expect(()=>guard(url)).toThrow();
  expect(guard('postgresql://zohra_audit@127.0.0.1:55439/zohra_pw_test')).toBe('zohra_pw_test');
});
test('E2E-001 bootstrap repeats without losing data and detects changed checksums',async({audit})=>{
  await bootstrap(audit.pool);
  expect((await audit.rows('SELECT count(*)::int AS count FROM playwright_schema_history'))[0].count).toBe(migrations.length);
  expect((await audit.rows('SELECT count(*)::int AS count FROM users'))[0].count).toBe(3);
  expect((await audit.rows('SELECT count(*)::int AS count FROM transaction_categories'))[0].count).toBe(10);
  expect((await audit.rows('SELECT count(*)::int AS count FROM config_options'))[0].count).toBeGreaterThan(0);
  await audit.pool.query('UPDATE playwright_schema_history SET sha256=$1 WHERE path=$2',['changed',migrations[0]]);
  await expect(bootstrap(audit.pool)).rejects.toThrow('checksum changed');
});
test('AUTH-001 separate owner, manager and staff logins identify the correct accounts',async({audit,page})=>{
  for(const role of ['owner','manager','staff']){
    await audit.login(page,role);
    const current=await audit.api('GET','auth/me',undefined,role);
    expect(current.status).toBe(200);expect(current.body.email).toBe(role+'@audit.invalid');
    await page.evaluate(()=>localStorage.clear());
  }
});
