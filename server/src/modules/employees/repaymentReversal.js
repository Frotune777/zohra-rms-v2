const db = require("../../config/db");
const { DomainError, statusFor } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const JournalService = require("../finance/JournalService");
async function reverse(id, reason, userId) {
  if (!reason?.trim())
    throw new DomainError("Repayment reversal reason required");
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    await assertWritable(c, new Date());
    const candidate = (
      await c.query("SELECT employee_id FROM advance_requests WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!candidate) throw new DomainError("Repayment not found", 404);
    await c.query("SELECT id FROM employees WHERE id=$1 FOR UPDATE", [
      candidate.employee_id,
    ]);
    const request = (
      await c.query("SELECT * FROM advance_requests WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    const prior = (
      await c.query(
        "SELECT * FROM advance_repayment_reversals WHERE advance_request_id=$1",
        [id],
      )
    ).rows[0];
    if (prior) {
      if (prior.reason !== reason.trim())
        throw new DomainError(
          "Repayment already reversed with another reason",
          409,
        );
      await c.query("COMMIT");
      return prior;
    }
    if (request.type !== "Repayment" || request.status !== "Approved")
      throw new DomainError(
        "Only approved manual repayments can be reversed",
        409,
      );
    const ledger = (
      await c.query(
        "SELECT * FROM advance_ledger WHERE advance_request_id=$1 AND transaction_type='Repayment' FOR UPDATE",
        [id],
      )
    ).rows[0];
    const allocations = (
      await c.query(
        "SELECT * FROM advance_manual_allocations WHERE advance_request_id=$1 AND reversed=FALSE ORDER BY salary_advance_id FOR UPDATE",
        [id],
      )
    ).rows;
    if (
      !ledger ||
      Math.round(
        allocations.reduce((s, a) => s + Number(a.amount), 0) * 100,
      ) !== Math.round(Number(request.requested_amount) * 100)
    )
      throw new DomainError(
        "Historical repayment allocations need reconciliation before reversal",
        409,
      );
    const journal = await JournalService.reverseJournalEntry(
      ledger.journal_entry_id,
      reason,
      new Date(),
      c,
    );
    for (const a of allocations) {
      const updated = await c.query(
        "UPDATE salary_advances SET total_repaid=total_repaid-$2,recovered_amount=recovered_amount-$2,balance_remaining=balance_remaining+$2,is_recovered=FALSE,status='Active' WHERE id=$1 AND recovered_amount >= $2 AND total_repaid >= $2 RETURNING id",
        [a.salary_advance_id, a.amount],
      );
      if (!updated.rowCount)
        throw new DomainError(
          "Advance recovery history needs reconciliation",
          409,
        );
      await c.query(
        "UPDATE advance_manual_allocations SET reversed=TRUE WHERE id=$1",
        [a.id],
      );
    }
    await require("./advanceSchedule").reverse(c, ledger.journal_entry_id);
    const balance = await require("./AdvanceService").getEmployeeBalance(
      request.employee_id,
      c,
    );
    await c.query(
      "INSERT INTO advance_ledger(employee_id,transaction_type,amount,balance_after,notes,payment_mode,approved_by,approved_at,journal_entry_id) VALUES($1,'Advance',$2,$3,$4,$5,$6,NOW(),$7)",
      [
        request.employee_id,
        request.requested_amount,
        balance + Number(request.requested_amount),
        "Reversal of manual repayment #" + id + ": " + reason,
        request.payment_mode,
        userId,
        journal.id,
      ],
    );
    const row = (
      await c.query(
        "INSERT INTO advance_repayment_reversals(advance_request_id,journal_entry_id,reason,created_by) VALUES($1,$2,$3,$4) RETURNING *",
        [id, journal.id, reason.trim(), userId],
      )
    ).rows[0];
    await c.query("UPDATE advance_requests SET status='Reversed' WHERE id=$1", [
      id,
    ]);
    await c.query("COMMIT");
    return row;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
exports.reverse = reverse;
exports.controller = async (req, res) => {
  try {
    res.json(await reverse(req.params.id, req.body.reason, req.user.id));
  } catch (e) {
    res.status(statusFor(e)).json({ error: e.message });
  }
};
