const {test,expect}=require('./fixtures.cjs');
const {payrollFixture,snapshot}=require('./helpers.cjs');
test('PAY-009 payer name entered in the payout UI is accepted and persisted',async({audit,page})=>{
  const salary=await payrollFixture(audit);
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));
  await audit.session(page);await page.goto('/payroll');
  await page.getByRole('button',{name:'2. Payouts',exact:true}).click();
  await page.getByRole('button',{name:'Mark Paid',exact:true}).click();
  await page.locator('#payment-paid-by').fill('Audit owner');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/payroll/payout')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Confirm Payment',exact:true}).click();
  const result=await response;const body=await result.json();audit.check('Payer name browser response',{status:result.status(),body});
  expect(result.status(),JSON.stringify(body)).toBe(200);
  expect((await audit.rows('SELECT status,paid_by FROM salary_history WHERE id=$1',[salary.id]))[0]).toEqual({status:'Paid',paid_by:'Audit owner'});
});
