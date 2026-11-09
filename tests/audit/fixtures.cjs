const base=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const bcrypt=require('../../server/node_modules/bcryptjs');
const {root,ADMIN_URL,databaseUrl,poolFor}=require('./database.cjs');
const API_URL='http://127.0.0.1:33130';
const PASSWORD='Audit-valid-password-42';
const DATE='2026-11-09';
async function seed(pool) {
  const retained=['chart_of_accounts','payment_modes','transaction_categories','vendor_categories',
    'config_options','tax_rates','salary_components_master','playwright_schema_history','schema_migrations'];
  const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  const names=tables.rows.map(r=>r.tablename).filter(n=>!retained.includes(n));
  const defaults={};
  for(const table of retained) defaults[table]=(await pool.query('SELECT to_jsonb(t) AS row FROM '+table+' t')).rows.map(r=>r.row);
  await pool.query('TRUNCATE '+names.map(n=>'"'+n+'"').join(',')+' RESTART IDENTITY CASCADE');
  // TRUNCATE users CASCADE also empties retained lookup tables with user FKs.
  // Restore exactly their template rows and sequences; never silently seed an empty config.
  for(const table of retained){
    if(defaults[table].length && !(await pool.query('SELECT 1 FROM '+table+' LIMIT 1')).rowCount){
      await pool.query('INSERT INTO '+table+' SELECT * FROM jsonb_populate_recordset(NULL::'+table+',$1)',[JSON.stringify(defaults[table])]);
      const serials=await pool.query("SELECT column_name,pg_get_serial_sequence($1,column_name) AS sequence FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table]);
      for(const column of serials.rows.filter(c=>c.sequence))await pool.query('SELECT setval($1,COALESCE((SELECT max("'+column.column_name+'") FROM '+table+'),1),true)',[column.sequence]);
    }
  }
  await pool.query("INSERT INTO chart_of_accounts(code,name,type) VALUES (1071,'Audit staff wallet','Asset'),(1072,'Audit manager wallet','Asset'),(3009,'Audit owner equity','Equity') ON CONFLICT(code) DO NOTHING");
  await pool.query("INSERT INTO employees(full_name,first_name,last_name,employee_code,position,base_salary,status) VALUES ('Audit Staff','Audit','Staff','E2E-001','Cook',30000,'active'),('Audit Manager','Audit','Manager','E2E-002','Manager',45000,'active'),('Other Employee','Other','Employee','E2E-003','Cook',20000,'active')");
  const hash=await bcrypt.hash(PASSWORD,4);
  for(const [role,employee,code] of [['owner',null,3009],['manager',2,1072],['staff',1,1071]])
    await pool.query('INSERT INTO users(email,password_hash,full_name,role,status,employee_id,ledger_account_code) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [role+'@audit.invalid',hash,'Audit '+role,role,'active',employee,code]);
  await pool.query("INSERT INTO inventory_items(name,stock_qty,unit_cost,unit) VALUES ('Audit Chicken',20,150,'kg'),('Audit Rice',10,50,'kg')");
  await pool.query("INSERT INTO menu_items(name,price,category) VALUES ('Audit Chicken Bowl',250,'Biryani'),('Audit Rice Bowl',100,'Curry')");
  await pool.query('INSERT INTO recipe_ingredients(menu_item_id,inventory_item_id,quantity_required) VALUES (1,1,0.25),(1,2,0.5),(2,2,0.5)');
  await pool.query("INSERT INTO suppliers(name,vendor_type,markup_required,opening_balance,ledger_account_code) VALUES ('Audit Chicken Supplier','Chicken',true,0,2000),('Other Supplier','Grocery',false,0,2000)");
  await pool.query("INSERT INTO daily_rates(date,tandoor_rate,boiler_rate,egg_rate,status) VALUES ($1,150,100,6,'confirmed')",[DATE]);
  await pool.query("INSERT INTO markup_rules(supplier_id,item_name,base_rate_type,op1,val1) VALUES (1,'Audit Chicken','TandoorRate','+',10)");
}
const test=base.test.extend({
  businessInstant:['2026-11-09T12:00:00Z',{option:true}],
  audit:async({playwright,businessInstant},use,testInfo)=>{
    const run=process.env.PW_AUDIT_RUN;
    if(!/^[0-9]+$/.test(run||'')) throw new Error('Missing isolated global setup.');
    const name='zohra_pw_case_'+crypto.createHash('sha256').update(testInfo.testId).digest('hex').slice(0,12)+'_'+run;
    const admin=poolFor(ADMIN_URL,true);
    const url=databaseUrl(name);
    let pool,server,client,log;
    const calls=[];
    try {
      await admin.query('CREATE DATABASE "'+name+'" TEMPLATE "'+process.env.PW_AUDIT_TEMPLATE+'"');
      pool=poolFor(url);await seed(pool);
      log=fs.createWriteStream(testInfo.outputPath('server.log'));
      const secret=crypto.randomBytes(32).toString('hex');
      server=spawn(process.execPath,['--require',path.join(__dirname,'coverage-hook.cjs'),'--require',path.join(__dirname,'clock.cjs'),path.join(root,'server/server.js')],{
        cwd:root,env:{...process.env,DATABASE_URL:url,PORT:'33130',CLIENT_URL:'http://127.0.0.1:33129',
          NODE_V8_COVERAGE:process.env.ZOHRA_AUDIT_V8_DIR||'',JWT_SECRET:secret,NODE_ENV:'development',TZ:'UTC',PW_AUDIT_INSTANT:businessInstant},stdio:['ignore','pipe','pipe']});
      server.stdout.pipe(log);server.stderr.pipe(log);
      client=await playwright.request.newContext({baseURL:API_URL});
      let ready=false;
      for(let attempt=0;attempt<50;attempt++) {
        if(server.exitCode!==null) throw new Error('Audit API exited during startup; see server.log');
        try {ready=(await client.get('/health',{timeout:300})).ok();}catch{}
        if(ready) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!ready) throw new Error('Audit API did not start; see server.log');
      const actors={};
      for(const role of ['owner','manager','staff']) {
        const response=await client.post('/api/auth/login',{data:{email:role+'@audit.invalid',password:PASSWORD}});
        base.expect(response.status(),'Fixture login for '+role).toBe(200);
        actors[role]=await response.json();base.expect(actors[role].user.role).toBe(role);
      }
      async function api(method,endpoint,data,role='owner',headers={}) {
        const response=await client.fetch('/api/'+endpoint.replace(/^\//,''),{method,
          ...(data!==undefined?{data}:{}),headers:{...(role?{Authorization:'Bearer '+actors[role].token}:{}),...headers}});
        let body;try{body=await response.json();}catch{body=await response.text();}
        calls.push({method,endpoint,role,status:response.status(),error:body?.error});
        return {status:response.status(),body,response};
      }
      const evidence={database:name,date:DATE,business_instant:businessInstant,calls,checks:[]};
      const audit={pool,actors,api,client,url,evidence,DATE,PASSWORD,
        service:async(service,method,...args)=>{
          const child=spawn(process.execPath,['--require',path.join(__dirname,'coverage-hook.cjs'),'--require',path.join(__dirname,'clock.cjs'),path.join(__dirname,'service-runner.cjs')],
            {cwd:root,env:{...process.env,DATABASE_URL:url,NODE_V8_COVERAGE:process.env.ZOHRA_AUDIT_V8_DIR||'',PW_AUDIT_INSTANT:businessInstant,TZ:'UTC'},stdio:['pipe','pipe','pipe']});
          let output='';child.stdout.on('data',data=>output+=data);child.stderr.pipe(log,{end:false});
          const ended=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Service runner exited '+code)));});
          child.stdin.end(JSON.stringify({service,method,args}));await ended;
          const result=JSON.parse(output.split('\n').find(line=>line.startsWith('AUDIT_RESULT ')).slice(13));
          evidence.checks.push({name:service+'.'+method,actual:result});return result;
        },
        sign:payload=>require('../../server/node_modules/jsonwebtoken').sign(payload,secret),
        check:(name,actual)=>evidence.checks.push({name,actual}),
        rows:async(sql,params=[]) => (await pool.query(sql,params)).rows,
        login:async(page,role='owner')=>{
          await page.goto('/login');
          await page.locator('input[type=email]').fill(role+'@audit.invalid');
          await page.locator('input[type=password]').fill(PASSWORD);
          await page.locator('button[type=submit]').click();
          await base.expect(page).toHaveURL('http://127.0.0.1:33129/');
          await base.expect(page.getByRole('heading',{name:'Select a table',exact:true})).toBeVisible();
        },
        openTable:async(page,number='1')=>{
          await page.getByRole('button',{name:'Table '+number,exact:true}).click();
          await base.expect(page.getByRole('heading',{name:'Table '+number,exact:true})).toBeVisible();
          await base.expect(page.getByLabel('Search query')).toBeVisible();
        },
        session:async(page,role='owner')=>{
          await page.addInitScript(actor=>{localStorage.setItem('token',actor.token);localStorage.setItem('user',JSON.stringify(actor.user));},actors[role]);
        },
      };
      try{await use(audit);}
      finally{
        const evidencePath=testInfo.outputPath('evidence.json');
        fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
        await testInfo.attach('audit-evidence',{path:evidencePath,contentType:'application/json'});
      }
    }finally{
      if(client) await client.dispose();
      if(server&&server.exitCode===null){
        const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');
        await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))]);
        if(server.exitCode===null){server.kill('SIGKILL');await exited;}
      }
      if(log) await new Promise(resolve=>log.end(resolve));
      if(pool) await pool.end();
      await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end();
    }
  },
});
module.exports={test,expect:base.expect,DATE,PASSWORD};
