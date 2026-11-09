const db = require("../../config/db");
const JournalService = require("../finance/JournalService");
const PaymentModeService = require("../finance/PaymentModeService");
const { assertWritable } = require("../finance/writeGuard");
const { DomainError, finite, statusFor } = require("../../utils/domain");
exports.list = async (req, res) => {
  try {
    res.json(
      (
        await db.query(
          "SELECT s.*,e.full_name,s.amount-s.settled_amount AS outstanding, COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM payroll_shortfall_settlements p WHERE p.shortfall_id=s.id),'[]') AS settlements FROM payroll_shortfalls s JOIN employees e ON e.id=s.employee_id ORDER BY s.id DESC",
        )
      ).rows,
    );
  } catch (e) {
    res.status(statusFor(e)).json({ error: e.message });
  }
};
exports.settle = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const amount =
      Math.round(
        finite(req.body.amount, "Settlement amount", { positive: true }) * 100,
      ) / 100;
    if (amount <= 0)
      throw new DomainError("Settlement amount must be at least 0.01");
    if (typeof req.body.reference !== 'string') throw new DomainError('Payment reference required');
    const reference = req.body.reference.trim();
    if (!reference) throw new DomainError("Payment reference required");
    const mode = req.body.paymentMode || "Cash";
    const account = await PaymentModeService.getAccountCode(mode, client);
    await assertWritable(client, new Date(), [account, 1110]);
    const short = (
      await client.query(
        "SELECT * FROM payroll_shortfalls WHERE id=$1 FOR UPDATE",
        [req.params.id],
      )
    ).rows[0];
    if (!short) throw new DomainError("Shortfall not found", 404);
    const existing = (
      await client.query(
        "SELECT * FROM payroll_shortfall_settlements WHERE reference=$1",
        [reference],
      )
    ).rows[0];
    if (existing) {
      if (
        String(existing.shortfall_id) !== String(short.id) ||
        Number(existing.amount) !== amount ||
        existing.payment_mode !== mode ||
        existing.reversed
      )
        throw new DomainError("Payment reference already used", 409);
      await client.query("COMMIT");
      return res.json(existing);
    }
    if (
      short.status !== "Open" ||
      Math.round(amount * 100) >
        Math.round(Number(short.amount) * 100) -
          Math.round(Number(short.settled_amount) * 100)
    )
      throw new DomainError("Settlement exceeds outstanding shortfall", 409);
    const je = await JournalService.createJournalEntry(
      {
        date: new Date(),
        description: "Payroll shortfall settlement #" + short.id,
        reference_type: "PayrollShortfallSettlement",
        reference_id: reference,
        lines: [
          { account_code: account, debit: amount },
          { account_code: 1110, credit: amount },
        ],
      },
      client,
    );
    const payment = (
      await client.query(
        "INSERT INTO payroll_shortfall_settlements(shortfall_id,amount,payment_mode,journal_entry_id,created_by,reference) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [short.id, amount, mode, je.id, req.user.id, reference],
      )
    ).rows[0];
    await client.query(
      "UPDATE payroll_shortfalls SET settled_amount=settled_amount+$2,status=CASE WHEN settled_amount+$2=amount THEN 'Settled' ELSE 'Open' END WHERE id=$1",
      [short.id, amount],
    );
    await client.query("COMMIT");
    res.json(payment);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(statusFor(e)).json({ error: e.message });
  } finally {
    client.release();
  }
};
exports.reverseSettlement = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    if (typeof req.body.reason !== 'string' || !req.body.reason.trim()) throw new DomainError("Reason required");
    const candidate = (
      await client.query(
        "SELECT p.*,j.transaction_date FROM payroll_shortfall_settlements p JOIN journal_entries j ON j.id=p.journal_entry_id WHERE p.id=$1",
        [req.params.paymentId],
      )
    ).rows[0];
    if (!candidate || String(candidate.shortfall_id) !== String(req.params.id))
      throw new DomainError("Settlement not found", 404);
    await assertWritable(client, candidate.transaction_date);
    await client.query(
      "SELECT id FROM payroll_shortfalls WHERE id=$1 FOR UPDATE",
      [candidate.shortfall_id],
    );
    const p = (
      await client.query(
        "SELECT * FROM payroll_shortfall_settlements WHERE id=$1 FOR UPDATE",
        [candidate.id],
      )
    ).rows[0];
    if (!p.reversed) {
      await JournalService.reverseJournalEntry(
        p.journal_entry_id,
        req.body.reason,
        candidate.transaction_date,
        client,
      );
      await client.query(
        "UPDATE payroll_shortfall_settlements SET reversed=TRUE WHERE id=$1",
        [p.id],
      );
      await client.query(
        "UPDATE payroll_shortfalls SET settled_amount=settled_amount-$2,status='Open' WHERE id=$1",
        [p.shortfall_id, p.amount],
      );
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(statusFor(e)).json({ error: e.message });
  } finally {
    client.release();
  }
};
