const db = require("../../config/db");
const { DomainError, finite } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const JournalService = require("../finance/JournalService");
const JournalEntry = require("../finance/entities/JournalEntry");
const PaymentModeService = require("../finance/PaymentModeService");

class AdvanceService {
  /**
   * Get All Advances
   */
  async getAllAdvances(employeeId = null) {
    const query = `
            SELECT al.*, (SELECT row_to_json(r) FROM advance_repayment_reversals r WHERE r.advance_request_id=al.advance_request_id AND al.transaction_type='Repayment') AS reversal, e.full_name as employee_name, e.employee_code, e.role
            FROM advance_ledger al
            JOIN employees e ON al.employee_id = e.id
            WHERE ($1::int IS NULL OR al.employee_id=$1)
            ORDER BY al.transaction_date DESC
        `;
    const result = await db.query(query, [employeeId]);
    return result.rows;
  }

  /**
   * Get Employee Balance
   */
  async getEmployeeBalance(employeeId, client = db) {
    const result = await client.query(
      `SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
             FROM advance_ledger WHERE employee_id = $1`,
      [employeeId],
    );
    return parseFloat(result.rows[0].balance || 0);
  }

  /**
   * Create Advance Request
   */
  async createRequest(data, userId, client = db) {
    const { employeeId, type, amount, notes, paymentMode, paidBy } = data;
    finite(amount, "Advance amount", { positive: true });
    if (!["Advance", "Repayment"].includes(type))
      throw new DomainError("Invalid advance transaction type");
    const result = await client.query(
      `
            INSERT INTO advance_requests 
            (employee_id, type, requested_amount, reason, payment_mode, paid_by, requested_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `,
      [
        employeeId,
        type,
        parseFloat(amount),
        notes,
        paymentMode || "Cash",
        paidBy,
        userId,
      ],
    );
    return result.rows[0];
  }

  /**
   * Get All Requests
   */
  async getRequests() {
    const query = `
            SELECT ar.*, ar.requested_amount as amount, e.full_name as employee_name, e.employee_code, e.role, u.full_name as requester_name
            FROM advance_requests ar
            JOIN employees e ON ar.employee_id = e.id
            LEFT JOIN users u ON ar.requested_by = u.id
            ORDER BY 
                CASE WHEN ar.status = 'Pending' THEN 1 ELSE 2 END,
                ar.requested_at DESC
        `;
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Approve Request
   */
  async approveRequest(id, userId, client, options = {}) {
    await assertWritable(client, new Date());
    const candidate = (
      await client.query(
        "SELECT employee_id FROM advance_requests WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!candidate) throw new DomainError("Request not found", 404);
    await client.query("SELECT id FROM employees WHERE id=$1 FOR UPDATE", [
      candidate.employee_id,
    ]);
    const reqRes = await client.query(
      "SELECT * FROM advance_requests WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (reqRes.rows.length === 0)
      throw new DomainError("Request not found", 404);
    const request = reqRes.rows[0];

    if (request.status !== "Pending")
      throw new DomainError("Request already processed", 409);
    const scheduled = request.type == null;
    if (options.schedule && request.type === "Repayment")
      throw new DomainError(
        "Repayment requests cannot create an advance schedule",
      );
    request.type = request.type || "Advance";
    request.requested_amount =
      options.approved_amount ?? request.requested_amount;
    const months =
      options.repayment_months ??
      (options.schedule || scheduled ? request.repayment_months : null);
    if (
      months &&
      !Number.isInteger(finite(months, "Repayment months", { positive: true }))
    )
      throw new DomainError("Repayment months must be a positive integer");
    request.payment_mode =
      options.payment_mode || request.payment_mode || "Cash";

    await client.query("SELECT id FROM employees WHERE id=$1 FOR UPDATE", [
      request.employee_id,
    ]);
    const currentBalance = await this.getEmployeeBalance(
      request.employee_id,
      client,
    );
    finite(request.requested_amount, "Advance amount", { positive: true });

    if (
      request.type === "Repayment" &&
      parseFloat(request.requested_amount) > currentBalance
    ) {
      throw new DomainError(
        `Repayment amount exceeds outstanding balance (₹${currentBalance})`,
      );
    }

    let newBalance = currentBalance;
    if (request.type === "Advance") {
      newBalance += parseFloat(request.requested_amount);
    } else {
      newBalance -= parseFloat(request.requested_amount);
    }

    const cashAccount = await PaymentModeService.getAccountCode(
      request.payment_mode || "cash",
      client,
    );

    // Create Journal Entry (Domain Driven)
    const journal = new JournalEntry({
      date: new Date(),
      description: `Salary ${request.type} - ${request.reason}`,
      reference_id: id,
      reference_type: `Advance${request.type}`,
      lines:
        request.type === "Advance"
          ? [
              {
                account_code: 1100,
                debit: parseFloat(request.requested_amount),
                credit: 0,
              }, // Dr: Advance Receivable
              {
                account_code: cashAccount,
                debit: 0,
                credit: parseFloat(request.requested_amount),
              }, // Cr: Cash/Bank
            ]
          : [
              {
                account_code: cashAccount,
                debit: parseFloat(request.requested_amount),
                credit: 0,
              }, // Dr: Cash/Bank
              {
                account_code: 1100,
                debit: 0,
                credit: parseFloat(request.requested_amount),
              }, // Cr: Advance Receivable
            ],
    });

    const je = await JournalService.createJournalEntry(journal, client);

    const ledgerRes = await client.query(
      `
            INSERT INTO advance_ledger 
            (employee_id, transaction_type, amount, balance_after, notes, payment_mode, paid_by, advance_request_id, approved_by, approved_at, journal_entry_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
            RETURNING *
        `,
      [
        request.employee_id,
        request.type,
        request.requested_amount,
        newBalance,
        request.reason,
        request.payment_mode,
        request.paid_by,
        id,
        userId,
        je.id,
      ],
    );

    await client.query(
      `
            UPDATE advance_requests SET status = 'Approved', approved_by = $1, approved_at = NOW(),type=$3,approved_amount=$4 WHERE id = $2
        `,
      [userId, id, request.type, request.requested_amount],
    );

    if (request.type === "Advance") {
      const modern = (
        await client.query(
          "INSERT INTO salary_advances(employee_id,amount,balance_remaining,status,recovered_amount,is_recovered,advance_request_id) VALUES($1,$2,$2,'Active',0,FALSE,$3) RETURNING id",
          [request.employee_id, request.requested_amount, id],
        )
      ).rows[0];
      await client.query(
        "UPDATE advance_ledger SET salary_advance_id=$1 WHERE id=$2",
        [modern.id, ledgerRes.rows[0].id],
      );
      if (months)
        await require("./advanceSchedule").create(
          client,
          request,
          Number(request.requested_amount),
          Number(months),
        );
    } else {
      const advances = await client.query(
        "SELECT * FROM salary_advances WHERE employee_id=$1 AND balance_remaining > 0 ORDER BY created_at,id FOR UPDATE",
        [request.employee_id],
      );
      let remaining = Number(request.requested_amount);
      for (const advance of advances.rows) {
        if (remaining <= 0) break;
        const amount = Math.min(remaining, Number(advance.balance_remaining));
        await client.query(
          "UPDATE salary_advances SET total_repaid=COALESCE(total_repaid,0)+$1,recovered_amount=COALESCE(recovered_amount,0)+$1,balance_remaining=balance_remaining-$1,is_recovered=(balance_remaining-$1 <= 0),status=CASE WHEN balance_remaining-$1 <= 0 THEN 'Recovered' ELSE 'Active' END WHERE id=$2",
          [amount, advance.id],
        );
        await require("./advanceSchedule").recover(
          client,
          advance,
          amount,
          je.id,
        );
        await client.query(
          "INSERT INTO advance_manual_allocations(advance_request_id,salary_advance_id,amount,journal_entry_id) VALUES($1,$2,$3,$4)",
          [id, advance.id, amount, je.id],
        );
        remaining = Number((remaining - amount).toFixed(2));
      }
      if (remaining > 0)
        throw new DomainError(
          "Advance models disagree on outstanding balance",
          409,
        );
    }
    return { jeId: je.id, ledgerEntry: ledgerRes.rows[0] };
  }

  /**
   * Reject Request
   */
  async rejectRequest(id, userId, reason) {
    const result = await db.query(
      `
            UPDATE advance_requests SET status = 'Rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2 WHERE id = $3 AND status='Pending' RETURNING id
        `,
      [userId, reason, id],
    );
    if (!result.rowCount)
      throw new DomainError("Request not found or already processed", 409);
    return true;
  }
}

module.exports = new AdvanceService();
