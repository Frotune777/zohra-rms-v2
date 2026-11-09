// Flush real API/service V8 coverage before the disposable process is stopped.
if(process.env.ZOHRA_AUDIT_V8_DIR){
 const v8=require('node:v8');
 process.on('SIGTERM',()=>{v8.takeCoverage();process.exit(0);});
}
