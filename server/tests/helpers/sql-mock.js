const {mockQueryResult:result}=require('./db-mock');
// SQL-aware ancillary fixtures keep added validation from consuming source-row queues.
// Unexpected queries fail so a successful response cannot conceal missing mock data.
function sqlMock(query, handler) {
  let journalId=100;
  query.mockReset().mockImplementation(async(raw,p=[])=>{
    const sql=raw.replace(/\s+/g,' ').trim();
    const custom=await handler(sql,p);
    if(custom !== undefined)return custom;
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql) || sql.includes('pg_advisory') || /^SELECT id FROM employees .*FOR UPDATE/.test(sql))return result([]);
    if(sql.includes('FROM financial_periods') || sql.includes("status = 'Closed' AND account_code = ANY"))return result([]);
    if(sql.startsWith('SELECT code FROM chart_of_accounts'))return result([{code:p[0]}]);
    if(sql.includes('FROM payment_modes'))return result([{account_code:/bank|card/i.test(p[0])?1010:1000}]);
    if(sql.startsWith('INSERT INTO journal_entries'))return result([{id:journalId++}]);
    if(sql.startsWith('INSERT INTO ledger_lines'))return result([]);
    throw new Error('Unexpected unit SQL: '+sql);
  });
}
module.exports={sqlMock};

