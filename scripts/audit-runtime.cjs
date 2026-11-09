// Route probes plus synthetic fixtures in the disposable audit database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const schemaResults = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit/schema-results.json')));
const database = schemaResults.find(result => result.mode === 'diagnostic-combined').database;
if (!/^zohra_audit_diagnostic(_[0-9]+)?$/.test(database)) throw new Error('Expected a disposable audit database.');
process.env.DATABASE_URL = `postgresql://zohra_audit@127.0.0.1:55439/${database}`;
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');
const app = require('../server/src/app');
const JournalEntry = require('../server/src/modules/finance/entities/JournalEntry');
const permissions = require('../server/src/config/permissions').PERMISSIONS;
const mounts = {
  auth: '/api/auth', inventory: '/api/inventory', finance: '/api/finance',
  employees: '/api/employees', pos: '/api', operations: '/api',
  dashboard: '/api/dashboard', ai: '/api/ai', reports: '/api/reports',
  payroll: '/api/payroll', attendance: '/api/attendance', leaves: '/api/leaves',
  'advance-requests': '/api/advance-requests', vendors: '/api/vendors', config: '/api/config',
};
const result = { database,
  limitation: 'Schema is a best-effort diagnostic build. HTTP 200 proves only this request, not feature correctness.',
  probes: [], checks: [], schema: [] };
let server;

async function run() {
  const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
  const user = await db.query(`INSERT INTO users (email, password_hash, full_name, role, status)
    VALUES ('owner@alzohra.com', $1, 'Synthetic Audit Owner', 'owner', 'inactive')
    ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'inactive' RETURNING id`, [passwordHash]);
  const ownerId = user.rows[0].id;
  const tokens = Object.fromEntries(['owner', 'manager', 'staff'].map(role => [role,
    jwt.sign({ id: ownerId, email: 'audit@example.invalid', role }, process.env.JWT_SECRET)]));
  result.schema = (await db.query(`SELECT table_name, column_name, data_type
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`)).rows;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, role = 'anonymous', options = {}) {
    const response = await fetch(base + url, { ...options,
      signal: AbortSignal.timeout(10000), headers: {
        ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
    return { status: response.status, error: body?.error || null,
      response_kind: Array.isArray(body) ? 'array' : typeof body,
      rows: Array.isArray(body) ? body.length : undefined, body, headers: response.headers };
  }
  const routes = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit/repository-inventory.json')));
  const query = '?date=2026-11-01&startDate=2026-11-01&endDate=2026-11-09&month=11&year=2026&supplierId=1';
  for (const route of routes.server_route_registrations.filter(route => route.method === 'GET')) {
    const module = route.file.split('/')[3];
    let endpoint = mounts[module] + (route.path === '/' ? '' : route.path);
    endpoint = endpoint.replace(':date', '2026-11-01').replace(':code', '1000')
      .replace(':category', 'payment_mode').replace(':itemId', '1')
      .replace(':id', module === 'finance' && endpoint.includes('/journal/')
        ? '00000000-0000-0000-0000-000000000000' : '1');
    for (const role of ['anonymous', 'staff', 'manager', 'owner']) {
      const response = await request(endpoint + query, role);
      result.probes.push({ source: route.file, line: route.line, endpoint, role,
        status: response.status, error: response.error, response_kind: response.response_kind, rows: response.rows });
    }
  }
  const bypass = await request('/api/auth/login', 'anonymous', {method: 'POST',
    body: JSON.stringify({email: 'owner@alzohra.com', password: 'owner123'})});
  result.checks.push({name: 'Demo password bypasses a different bcrypt hash and inactive status',
    status: bypass.status, token_issued: !!bypass.body.token });
  const cors = await request('/health', 'anonymous', {headers: {Origin: 'https://untrusted.example.invalid'}});
  result.checks.push({name: 'Unlisted CORS origin', allow_origin: cors.headers.get('access-control-allow-origin')});
  const approval = await request('/api/leaves/999999/approve', 'manager',
    {method: 'PUT', body: '{}'});
  result.checks.push({name: 'Manager leave approval using undefined HR_WRITE permission',
    status: approval.status, error: approval.error, permission_defined: 'HR_WRITE' in permissions});
  const config = await request('/api/config/audit_synthetic', 'staff', {method: 'POST',
    body: JSON.stringify({value: `audit_${Date.now()}`, label: 'Synthetic audit option'})});
  result.checks.push({name: 'Staff can write system configuration', status: config.status, error: config.error});
  const observer = new (require('pg').Pool)({connectionString: process.env.DATABASE_URL});
  try {
    const supplier = await db.query("INSERT INTO suppliers (name, vendor_type) VALUES ('Synthetic Audit Supplier', 'Meat') RETURNING id");
    await db.query(`INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate)
      VALUES ('2026-11-02', 100, 100, 5) ON CONFLICT (date) DO NOTHING`);
    const bill = await require('../server/src/modules/inventory/service').createBillEntry({
      date: '2026-11-02', supplier_id: supplier.rows[0].id, item_name: 'Synthetic Unmapped Cut', qty: 1, vendor_rate: 100,
    }, ownerId);
    const visible = await observer.query('SELECT COUNT(*) AS count FROM bill_entries WHERE id = $1', [bill.id]);
    result.checks.push({name: 'Bill creation returns before committing', returned_bill_id: bill.id,
      rows_visible_from_separate_connection: Number(visible.rows[0].count)});
  } catch (error) { result.checks.push({name: 'Bill commit probe', error: error.message}); }
  finally {
    const client = await db.pool.connect();
    try { await client.query('ROLLBACK'); } finally {client.release(); await observer.end();}
  }
  for (const [name, value] of [['NaN string', 'invalid'], ['Infinity', Infinity], ['Invalid date', 10]]) {
    try {
      const entry = new JournalEntry({date: name === 'Invalid date' ? 'not-a-date' : '2026-11-01',
        description: 'Synthetic audit', lines: [
          {account_code: 1000, debit: value}, {account_code: 4000, credit: value}]});
      result.checks.push({name: `Journal entity accepts ${name}`, accepted: true,
        date_valid: Number.isFinite(entry.date.getTime())});
    } catch (error) { result.checks.push({name: `Journal entity accepts ${name}`, accepted: false, error: error.message}); }
  }
  const output = path.join(root, 'docs/audit/runtime-results.json');
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({probes: result.probes.length,
    statuses: result.probes.reduce((counts, probe) => {counts[probe.status] = (counts[probe.status] || 0) + 1; return counts;}, {}),
    checks: result.checks}, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.pool.end();
});
