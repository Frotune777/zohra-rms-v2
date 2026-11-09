// Separate process: never imports the application's default DB in the runner.
const path=require('node:path');
const {guard,root}=require('./database.cjs');
guard(process.env.DATABASE_URL);
const allowed={JournalService:['createJournalEntry','reverseJournalEntry'],ClosureService:['calculateExpectedClosing']};
let input='';process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',async()=>{
  let db;
  try {
    const {service,method,args}=JSON.parse(input);
    if(!allowed[service]?.includes(method))throw new Error('Unsupported audit service call');
    db=require(path.join(root,'server/src/config/db.js'));
    const instance=require(path.join(root,'server/src/modules/finance',service+'.js'));
    const value=await instance[method](...args);
    process.stdout.write('AUDIT_RESULT '+JSON.stringify({ok:true,value})+'\n');
  }catch(error){process.stdout.write('AUDIT_RESULT '+JSON.stringify({ok:false,error:error.message})+'\n');}
  finally{if(db)await db.pool.end();}
});
