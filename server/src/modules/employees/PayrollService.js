const {buildDrafts}=require('../payroll/drafts');
// Both payroll APIs create drafts; payout is exclusively owned by payroll/lifecycle.
class PayrollService {
 async runPayroll(data,client) {
  const rows=await buildDrafts(data,client);
  return {success:true,data:rows,netPay:rows[0]?.net_pay,earnedSalary:rows[0]?Number(rows[0].calculated_salary)-Number(data.manualAdjustment || 0):undefined,salaryHistoryId:rows[0]?.id};
 }
}
module.exports=new PayrollService();
