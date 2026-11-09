// Real PostgreSQL fixtures: explicit disposable target, no application credentials.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { ADMIN_URL, CLUSTER, databaseUrl, poolFor, bootstrap } = require('../../../tests/audit/database.cjs');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function integration() {
  const context = { instant: '2026-11-09T12:00:00Z' };
  let admin, pool, db, app, tables, defaults, faults = [];
  const name = 'zohra_pw_jest_' + process.pid + '_' + crypto.randomBytes(6).toString('hex');
  const retained = ['chart_of_accounts', 'payment_modes', 'transaction_categories', 'vendor_categories',
    'config_options', 'tax_rates', 'salary_components_master', 'playwright_schema_history', 'schema_migrations'];

  beforeAll(async () => {
    admin = poolFor(ADMIN_URL, true);
    const directory = (await admin.query('SHOW data_directory')).rows[0].data_directory;
    if (fs.realpathSync(directory) !== fs.realpathSync(CLUSTER)) throw new Error('Wrong disposable PostgreSQL cluster');
    await admin.query('CREATE DATABASE "' + name + '"');
    pool = poolFor(databaseUrl(name));
    await bootstrap(pool);
    tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
    defaults = {};
    for (const table of retained) defaults[table] = (await pool.query('SELECT to_jsonb(t) AS row FROM ' + table + ' t')).rows.map(r => r.row);
    process.env.DATABASE_URL = databaseUrl(name);
    process.env.JWT_SECRET = 'jest-isolated-fixture-secret';
    db = require('../../src/config/db');
    app = require('../../src/app');
    Object.assign(context, { pool, db, name });
  });

  beforeEach(async () => {
    const business = tables.filter(t => !['schema_migrations','playwright_schema_history'].includes(t));
    await pool.query('TRUNCATE ' + business.map(t => '"' + t + '"').join(',') + ' RESTART IDENTITY CASCADE');
    for (const table of retained) {
      if (!['schema_migrations','playwright_schema_history'].includes(table) && defaults[table].length) {
        await pool.query('INSERT INTO ' + table + ' SELECT * FROM jsonb_populate_recordset(NULL::' + table + ',$1)', [JSON.stringify(defaults[table])]);
        const serials = await pool.query("SELECT column_name,pg_get_serial_sequence($1,column_name) AS sequence FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]);
        for (const col of serials.rows.filter(c => c.sequence)) await pool.query('SELECT setval($1,COALESCE((SELECT max("' + col.column_name + '") FROM ' + table + '),1),true)', [col.sequence]);
      }
    }
    await pool.query("INSERT INTO chart_of_accounts(code,name,type) VALUES(1071,'Jest staff wallet','Asset'),(1072,'Jest manager wallet','Asset'),(3009,'Jest owner equity','Equity') ON CONFLICT(code) DO NOTHING");
    await pool.query("INSERT INTO employees(full_name,employee_code,position,base_salary,status) VALUES('Jest Staff','JEST-1','Cook',30000,'active'),('Jest Manager','JEST-2','Manager',45000,'active'),('Other Employee','JEST-3','Cook',20000,'active')");
    const hash = await bcrypt.hash('Jest-password-42', 4);
    const actors = {};
    for (const [role,employee,account] of [['owner',null,3009],['manager',2,1072],['staff',1,1071]]) {
      const user = (await pool.query('INSERT INTO users(email,password_hash,full_name,role,status,employee_id,ledger_account_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,role,employee_id,ledger_account_code,full_name', [role+'@jest.invalid',hash,'Jest '+role,role,'active',employee,account])).rows[0];
      actors[role] = { ...user, token: jwt.sign({ id: user.id }, process.env.JWT_SECRET) };
    }
    await pool.query("INSERT INTO inventory_items(name,stock_qty,unit_cost,unit,stock_value) VALUES('Jest Chicken',20,150,'kg',3000),('Jest Rice',10,50,'kg',500)");
    await pool.query("INSERT INTO menu_items(name,price,category) VALUES('Jest Bowl',250,'Biryani'),('Jest Rice Bowl',100,'Curry')");
    await pool.query('INSERT INTO recipe_ingredients(menu_item_id,inventory_item_id,quantity_required) VALUES(1,1,0.25),(1,2,0.5),(2,2,0.5)');
    await pool.query("INSERT INTO suppliers(name,vendor_type,markup_required,opening_balance,ledger_account_code) VALUES('Jest Supplier','Chicken',true,0,2000),('Other Supplier','Grocery',false,0,2000)");
    Object.assign(context, { actors });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const table of faults) await pool.query('DROP TRIGGER IF EXISTS jest_failure ON "' + table + '"');
    faults = [];
    await pool.query('DROP FUNCTION IF EXISTS jest_force_failure()');
  });
  afterAll(async () => {
    if (db) await db.pool.end();
    if (pool) await pool.end();
    if (admin) {
      await admin.query('DROP DATABASE IF EXISTS "' + name + '"');
      await admin.end();
    }
  });

  context.api = (method, path, body, role = 'owner', headers = {}) => {
    let call = request(app)[method.toLowerCase()]('/api/' + path.replace(/^\//, ''));
    if (role) call = call.set('Authorization', 'Bearer ' + context.actors[role].token);
    for (const [key,value] of Object.entries(headers)) call = call.set(key,value);
    return body === undefined ? call : call.send(body);
  };
  context.rows = async (sql, params = []) => (await pool.query(sql, params)).rows;
  context.snapshot = async () => {
    const business = tables.filter(t => !['schema_migrations','playwright_schema_history'].includes(t));
    const query = business.map(t => "(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM " + JSON.stringify(t) + ' t) AS ' + JSON.stringify(t)).join(',');
    return (await pool.query('SELECT ' + query)).rows[0];
  };
  context.failOn = async (table, event = 'INSERT', condition = 'TRUE') => {
    if (!tables.includes(table) || !['INSERT','UPDATE','DELETE'].includes(event)) throw new Error('Invalid test fault target');
    await pool.query("CREATE OR REPLACE FUNCTION jest_force_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF " + condition + " THEN RAISE EXCEPTION 'Jest forced failure'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER jest_failure AFTER ' + event + ' ON "' + table + '" FOR EACH ROW EXECUTE FUNCTION jest_force_failure()');
    faults.push(table);
  };
  context.journal = async (type, id, expected) => {
    const journals = await context.rows('SELECT id FROM journal_entries WHERE reference_type=$1 AND reference_id=$2', [type,String(id)]);
    expect(journals).toHaveLength(1);
    const lines = await context.rows('SELECT account_code AS account,debit,credit FROM ledger_lines WHERE journal_entry_id=$1 ORDER BY account_code', [journals[0].id]);
    expect(lines.map(l => ({account:Number(l.account),debit:Number(l.debit),credit:Number(l.credit)}))).toEqual([...expected].sort((a,b) => a.account-b.account));
    return journals[0].id;
  };
  context.balance = async account => Number((await context.rows('SELECT COALESCE(SUM(debit-credit),0) AS balance FROM ledger_lines WHERE account_code=$1',[account]))[0].balance);
  context.closedPeriod = async status => pool.query("INSERT INTO financial_periods(name,start_date,end_date,status) VALUES('Jest locked period','2020-01-01','2035-12-31',$1)", [status]);
  context.waitForLock = async () => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'",[name])).rowCount) return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error('Competing writer never reached the controlled database lock');
  };
  context.transaction = async work => {
    const client=await pool.connect();
    try {await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}
    catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  };
  context.at = async (instant, work) => {
    const NativeDate=global.Date;
    class FixedDate extends NativeDate {
      constructor(...args){super(...(args.length?args:[instant]));}
      static now(){return new NativeDate(instant).getTime();}
    }
    global.Date=FixedDate;
    try{return await work();}finally{global.Date=NativeDate;}
  };
  return context;
}
module.exports = { integration };
