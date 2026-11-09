const { DomainError } = require("../../utils/domain");
async function create(client, request, amount, months) {
  if (!months) return;
  const cents = Math.round(amount * 100),
    today = new Date();
  for (let i = 1; i <= months; i++) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1),
    );
    date.setUTCDate(
      Math.min(
        today.getUTCDate(),
        new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate(),
      ),
    );
    const installment =
      (Math.floor(cents / months) + (i === months ? cents % months : 0)) / 100;
    await client.query(
      "INSERT INTO advance_repayment_schedule(advance_request_id,employee_id,month_number,due_date,scheduled_amount,status) VALUES($1,$2,$3,$4,$5,$6)",
      [
        request.id,
        request.employee_id,
        i,
        date.toISOString().slice(0, 10),
        installment,
        installment === 0 ? "Paid" : "Pending",
      ],
    );
  }
}
async function recover(client, advance, amount, journalId) {
  if (!advance.advance_request_id) return;
  const rows = (
    await client.query(
      "SELECT * FROM advance_repayment_schedule WHERE advance_request_id=$1 AND scheduled_amount>recovered_amount ORDER BY month_number FOR UPDATE",
      [advance.advance_request_id],
    )
  ).rows;
  let remaining = amount;
  for (const s of rows) {
    if (remaining <= 0) break;
    const part = Number(
      Math.min(
        remaining,
        Number(s.scheduled_amount) - Number(s.recovered_amount),
      ).toFixed(2),
    );
    await client.query(
      "UPDATE advance_repayment_schedule SET recovered_amount=recovered_amount+$2,status=CASE WHEN recovered_amount+$2=scheduled_amount THEN 'Paid' ELSE 'Partial' END WHERE id=$1",
      [s.id, part],
    );
    await client.query(
      "INSERT INTO advance_schedule_allocations(schedule_id,journal_entry_id,amount) VALUES($1,$2,$3)",
      [s.id, journalId, part],
    );
    remaining = Number((remaining - part).toFixed(2));
  }
  if (rows.length && remaining > 0)
    throw new DomainError(
      "Advance schedule disagrees with outstanding balance",
      409,
    );
}
async function reverse(client, journalId) {
  const rows = (
    await client.query(
      "SELECT * FROM advance_schedule_allocations WHERE journal_entry_id=$1 AND reversed=FALSE ORDER BY schedule_id FOR UPDATE",
      [journalId],
    )
  ).rows;
  for (const a of rows) {
    await client.query(
      "UPDATE advance_repayment_schedule SET recovered_amount=recovered_amount-$2,status=CASE WHEN recovered_amount-$2=0 THEN 'Pending' ELSE 'Partial' END WHERE id=$1",
      [a.schedule_id, a.amount],
    );
    await client.query(
      "UPDATE advance_schedule_allocations SET reversed=TRUE WHERE id=$1",
      [a.id],
    );
  }
}
module.exports = { create, recover, reverse };
