# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: corrections.spec.cjs >> AUTH-006 CLOSE-003 corrections reject staff and locked periods without writes
- Location: tests/audit/corrections.spec.cjs:407:1

# Error details

```
Error: apiRequestContext.post: read ECONNRESET
Call log:
  - → POST http://127.0.0.1:33130/api/auth/login
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.8127.18 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 68

```

# Test source

```ts
  1   | const base=require('@playwright/test');
  2   | const fs=require('node:fs');
  3   | const path=require('node:path');
  4   | const crypto=require('node:crypto');
  5   | const {spawn}=require('node:child_process');
  6   | const bcrypt=require('../../server/node_modules/bcryptjs');
  7   | const {root,ADMIN_URL,databaseUrl,poolFor}=require('./database.cjs');
  8   | const API_URL='http://127.0.0.1:33130';
  9   | const PASSWORD='Audit-valid-password-42';
  10  | const DATE='2026-11-09';
  11  | async function seed(pool) {
  12  |   const retained=['chart_of_accounts','payment_modes','transaction_categories','vendor_categories',
  13  |     'config_options','tax_rates','salary_components_master','playwright_schema_history','schema_migrations'];
  14  |   const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  15  |   const names=tables.rows.map(r=>r.tablename).filter(n=>!retained.includes(n));
  16  |   const defaults={};
  17  |   for(const table of retained) defaults[table]=(await pool.query('SELECT to_jsonb(t) AS row FROM '+table+' t')).rows.map(r=>r.row);
  18  |   await pool.query('TRUNCATE '+names.map(n=>'"'+n+'"').join(',')+' RESTART IDENTITY CASCADE');
  19  |   // TRUNCATE users CASCADE also empties retained lookup tables with user FKs.
  20  |   // Restore exactly their template rows and sequences; never silently seed an empty config.
  21  |   for(const table of retained){
  22  |     if(defaults[table].length && !(await pool.query('SELECT 1 FROM '+table+' LIMIT 1')).rowCount){
  23  |       await pool.query('INSERT INTO '+table+' SELECT * FROM jsonb_populate_recordset(NULL::'+table+',$1)',[JSON.stringify(defaults[table])]);
  24  |       const serials=await pool.query("SELECT column_name,pg_get_serial_sequence($1,column_name) AS sequence FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table]);
  25  |       for(const column of serials.rows.filter(c=>c.sequence))await pool.query('SELECT setval($1,COALESCE((SELECT max("'+column.column_name+'") FROM '+table+'),1),true)',[column.sequence]);
  26  |     }
  27  |   }
  28  |   await pool.query("INSERT INTO chart_of_accounts(code,name,type) VALUES (1071,'Audit staff wallet','Asset'),(1072,'Audit manager wallet','Asset'),(3009,'Audit owner equity','Equity') ON CONFLICT(code) DO NOTHING");
  29  |   await pool.query("INSERT INTO employees(full_name,first_name,last_name,employee_code,position,base_salary,status) VALUES ('Audit Staff','Audit','Staff','E2E-001','Cook',30000,'active'),('Audit Manager','Audit','Manager','E2E-002','Manager',45000,'active'),('Other Employee','Other','Employee','E2E-003','Cook',20000,'active')");
  30  |   const hash=await bcrypt.hash(PASSWORD,4);
  31  |   for(const [role,employee,code] of [['owner',null,3009],['manager',2,1072],['staff',1,1071]])
  32  |     await pool.query('INSERT INTO users(email,password_hash,full_name,role,status,employee_id,ledger_account_code) VALUES ($1,$2,$3,$4,$5,$6,$7)',
  33  |       [role+'@audit.invalid',hash,'Audit '+role,role,'active',employee,code]);
  34  |   await pool.query("INSERT INTO inventory_items(name,stock_qty,unit_cost,unit) VALUES ('Audit Chicken',20,150,'kg'),('Audit Rice',10,50,'kg')");
  35  |   await pool.query("INSERT INTO menu_items(name,price,category) VALUES ('Audit Chicken Bowl',250,'Biryani'),('Audit Rice Bowl',100,'Curry')");
  36  |   await pool.query('INSERT INTO recipe_ingredients(menu_item_id,inventory_item_id,quantity_required) VALUES (1,1,0.25),(1,2,0.5),(2,2,0.5)');
  37  |   await pool.query("INSERT INTO suppliers(name,vendor_type,markup_required,opening_balance,ledger_account_code) VALUES ('Audit Chicken Supplier','Chicken',true,0,2000),('Other Supplier','Grocery',false,0,2000)");
  38  |   await pool.query("INSERT INTO daily_rates(date,tandoor_rate,boiler_rate,egg_rate,status) VALUES ($1,150,100,6,'confirmed')",[DATE]);
  39  |   await pool.query("INSERT INTO markup_rules(supplier_id,item_name,base_rate_type,op1,val1) VALUES (1,'Audit Chicken','TandoorRate','+',10)");
  40  | }
  41  | const test=base.test.extend({
  42  |   businessInstant:['2026-11-09T12:00:00Z',{option:true}],
  43  |   audit:async({playwright,businessInstant},use,testInfo)=>{
  44  |     const run=process.env.PW_AUDIT_RUN;
  45  |     if(!/^[0-9]+$/.test(run||'')) throw new Error('Missing isolated global setup.');
  46  |     const name='zohra_pw_case_'+crypto.createHash('sha256').update(testInfo.testId).digest('hex').slice(0,12)+'_'+run;
  47  |     const admin=poolFor(ADMIN_URL,true);
  48  |     const url=databaseUrl(name);
  49  |     let pool,server,client,log;
  50  |     const calls=[];
  51  |     try {
  52  |       await admin.query('CREATE DATABASE "'+name+'" TEMPLATE "'+process.env.PW_AUDIT_TEMPLATE+'"');
  53  |       pool=poolFor(url);await seed(pool);
  54  |       log=fs.createWriteStream(testInfo.outputPath('server.log'));
  55  |       const secret=crypto.randomBytes(32).toString('hex');
  56  |       server=spawn(process.execPath,['--require',path.join(__dirname,'coverage-hook.cjs'),'--require',path.join(__dirname,'clock.cjs'),path.join(root,'server/server.js')],{
  57  |         cwd:root,env:{...process.env,DATABASE_URL:url,PORT:'33130',CLIENT_URL:'http://127.0.0.1:33129',
  58  |           NODE_V8_COVERAGE:process.env.ZOHRA_AUDIT_V8_DIR||'',JWT_SECRET:secret,NODE_ENV:'development',TZ:'UTC',PW_AUDIT_INSTANT:businessInstant},stdio:['ignore','pipe','pipe']});
  59  |       server.stdout.pipe(log);server.stderr.pipe(log);
  60  |       client=await playwright.request.newContext({baseURL:API_URL});
  61  |       let ready=false;
  62  |       for(let attempt=0;attempt<50;attempt++) {
  63  |         if(server.exitCode!==null) throw new Error('Audit API exited during startup; see server.log');
  64  |         try {ready=(await client.get('/health',{timeout:300})).ok();}catch{}
  65  |         if(ready) break;
  66  |         await new Promise(resolve=>setTimeout(resolve,100));
  67  |       }
  68  |       if(!ready) throw new Error('Audit API did not start; see server.log');
  69  |       const actors={};
  70  |       for(const role of ['owner','manager','staff']) {
> 71  |         const response=await client.post('/api/auth/login',{data:{email:role+'@audit.invalid',password:PASSWORD}});
      |                                     ^ Error: apiRequestContext.post: read ECONNRESET
  72  |         base.expect(response.status(),'Fixture login for '+role).toBe(200);
  73  |         actors[role]=await response.json();base.expect(actors[role].user.role).toBe(role);
  74  |       }
  75  |       async function api(method,endpoint,data,role='owner',headers={}) {
  76  |         const response=await client.fetch('/api/'+endpoint.replace(/^\//,''),{method,
  77  |           ...(data!==undefined?{data}:{}),headers:{...(role?{Authorization:'Bearer '+actors[role].token}:{}),...headers}});
  78  |         let body;try{body=await response.json();}catch{body=await response.text();}
  79  |         calls.push({method,endpoint,role,status:response.status(),error:body?.error});
  80  |         return {status:response.status(),body,response};
  81  |       }
  82  |       const evidence={database:name,date:DATE,business_instant:businessInstant,calls,checks:[]};
  83  |       const audit={pool,actors,api,client,url,evidence,DATE,PASSWORD,
  84  |         service:async(service,method,...args)=>{
  85  |           const child=spawn(process.execPath,['--require',path.join(__dirname,'coverage-hook.cjs'),'--require',path.join(__dirname,'clock.cjs'),path.join(__dirname,'service-runner.cjs')],
  86  |             {cwd:root,env:{...process.env,DATABASE_URL:url,NODE_V8_COVERAGE:process.env.ZOHRA_AUDIT_V8_DIR||'',PW_AUDIT_INSTANT:businessInstant,TZ:'UTC'},stdio:['pipe','pipe','pipe']});
  87  |           let output='';child.stdout.on('data',data=>output+=data);child.stderr.pipe(log,{end:false});
  88  |           const ended=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Service runner exited '+code)));});
  89  |           child.stdin.end(JSON.stringify({service,method,args}));await ended;
  90  |           const result=JSON.parse(output.split('\n').find(line=>line.startsWith('AUDIT_RESULT ')).slice(13));
  91  |           evidence.checks.push({name:service+'.'+method,actual:result});return result;
  92  |         },
  93  |         sign:payload=>require('../../server/node_modules/jsonwebtoken').sign(payload,secret),
  94  |         check:(name,actual)=>evidence.checks.push({name,actual}),
  95  |         rows:async(sql,params=[]) => (await pool.query(sql,params)).rows,
  96  |         login:async(page,role='owner')=>{
  97  |           await page.goto('/login');
  98  |           await page.locator('input[type=email]').fill(role+'@audit.invalid');
  99  |           await page.locator('input[type=password]').fill(PASSWORD);
  100 |           await page.locator('button[type=submit]').click();
  101 |           await base.expect(page).toHaveURL('http://127.0.0.1:33129/');
  102 |           await base.expect(page.getByText('No Item Selected',{exact:true})).toBeVisible();
  103 |         },
  104 |         session:async(page,role='owner')=>{
  105 |           await page.addInitScript(actor=>{localStorage.setItem('token',actor.token);localStorage.setItem('user',JSON.stringify(actor.user));},actors[role]);
  106 |         },
  107 |       };
  108 |       try{await use(audit);}
  109 |       finally{
  110 |         const evidencePath=testInfo.outputPath('evidence.json');
  111 |         fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  112 |         await testInfo.attach('audit-evidence',{path:evidencePath,contentType:'application/json'});
  113 |       }
  114 |     }finally{
  115 |       if(client) await client.dispose();
  116 |       if(server&&server.exitCode===null){
  117 |         const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');
  118 |         await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))]);
  119 |         if(server.exitCode===null){server.kill('SIGKILL');await exited;}
  120 |       }
  121 |       if(log) await new Promise(resolve=>log.end(resolve));
  122 |       if(pool) await pool.end();
  123 |       await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();
  124 |     }
  125 |   },
  126 | });
  127 | module.exports={test,expect:base.expect,DATE,PASSWORD};
  128 | 
```