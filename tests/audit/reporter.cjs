const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root=path.resolve(__dirname,'../..');
class AuditReporter {
  constructor() { this.results=[]; }
  onBegin(config,suite) {
    this.startedAt=new Date().toISOString();
    this.plannedTests=suite.allTests().map(test=>({title:test.title,file:path.relative(root,test.location.file),line:test.location.line}));
    const files=fs.readdirSync(path.join(root,'tests/audit')).map(name=>'tests/audit/'+name).filter(file=>fs.statSync(path.join(root,file)).isFile());
    files.push('playwright.audit.config.cjs');
    this.manifest=Object.fromEntries(files.sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  }
  onTestEnd(test,result) {
    this.results.push({title:test.title, file:path.relative(root,test.location.file), line:test.location.line,
      ids:[...new Set(test.title.match(/[A-Z][A-Z0-9]*-[0-9]{3}/g)||[])], status:result.status, duration_ms:result.duration,
      errors:result.errors.map(e=>e.message), annotations:test.annotations,
      attachments:result.attachments.map(a=>({name:a.name,path:a.path,contentType:a.contentType})),
      evidence:(()=>{const attachment=result.attachments.find(a=>a.name==='audit-evidence');return attachment?.path?JSON.parse(fs.readFileSync(attachment.path,'utf8')):null;})()});
  }
  onEnd(result) {
    fs.mkdirSync(path.join(root,'docs/audit/phase2'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs/audit/phase2/results.json'),JSON.stringify({started_at:this.startedAt,finished_at:new Date().toISOString(),
      planned_tests:this.plannedTests,source_sha256:this.manifest,
      status:result.status,counts:this.results.reduce((counts,r)=>(counts[r.status]=(counts[r.status]||0)+1,counts),{}),
      results:this.results},null,2)+'\n');
  }
}
module.exports=AuditReporter;
