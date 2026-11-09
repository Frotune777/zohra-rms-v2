const fs = require("node:fs"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test, expect } = require("./fixtures.cjs");
const {
  snapshot,
  journal,
  order,
  requestAdvance,
  seedJournal,
} = require("./helpers.cjs");
const paid = async (a, id) =>
  a.api("POST", "payroll/payout", {
    id,
    payment_mode: "Cash",
    payment_date: a.DATE,
  });
const generate = (a) =>
  a.api("POST", "payroll/run", {
    employeeId: 1,
    month: 11,
    year: 2026,
    daysWorked: 30,
  });
test("PAY-004 explicit recovery with no outstanding debt rejects in both payroll APIs", async ({
  audit,
}) => {
  const before = await snapshot(audit, [
    "salary_history",
    "salary_history_components",
    "advance_ledger",
    "journal_entries",
    "ledger_lines",
  ]);
  for (const endpoint of ["payroll/run", "employees/payroll/run"]) {
    const r = await audit.api("POST", endpoint, {
      employeeId: 1,
      month: 11,
      year: 2026,
      daysWorked: 30,
      advanceDeduction: 0.01,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("outstanding balance");
    expect(
      await snapshot(audit, [
        "salary_history",
        "salary_history_components",
        "advance_ledger",
        "journal_entries",
        "ledger_lines",
      ]),
    ).toEqual(before);
  }
});
test("PAY-004 POS-004 final cent payments reconcile order receivables and payroll shortfalls", async ({
  audit,
}) => {
  await audit.pool.query(
    "UPDATE menu_items SET price=0.30,tax_rate_id=NULL WHERE id=1",
  );
  const sale = await order(audit, {
    paymentMethod: "Part",
    amountPaid: 0.1,
    customerPhone: "cent-reconciliation",
  });
  expect(sale.status).toBe(200);
  const collection = await audit.api(
    "POST",
    "orders/" + sale.body.orderId + "/payments",
    { amount: 0.2, paymentMode: "Cash" },
    "owner",
    { "Idempotency-Key": "final-cent-order" },
  );
  expect(collection.status).toBe(200);
  expect(collection.body.order.payment_status).toBe("Paid");
  const draft = await audit.api("POST", "payroll/run", {
    employeeId: 1,
    month: 11,
    year: 2026,
    daysWorked: 30,
    manualAdjustment: -30000.3,
  });
  expect(draft.status).toBe(200);
  const id = draft.body.data[0].id;
  expect(Number(draft.body.data[0].net_pay)).toBe(-0.3);
  expect((await audit.api("POST", "payroll/approve", { id })).status).toBe(200);
  expect((await paid(audit, id)).status).toBe(200);
  const short = (await audit.api("GET", "payroll/shortfalls")).body[0];
  for (const [amount, reference] of [
    [0.1, "first-cent-shortfall"],
    [0.2, "last-cent-shortfall"],
  ])
    expect(
      (
        await audit.api("POST", "payroll/shortfalls/" + short.id + "/settle", {
          amount,
          reference,
          paymentMode: "Cash",
        })
      ).status,
    ).toBe(200);
  expect(
    (
      await audit.rows("SELECT status,settled_amount FROM payroll_shortfalls")
    )[0],
  ).toEqual({ status: "Settled", settled_amount: "0.30" });
  expect(
    Number(
      (
        await audit.rows(
          "SELECT SUM(debit-credit) AS balance FROM ledger_lines WHERE account_code=1120",
        )
      )[0].balance,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await audit.rows(
          "SELECT SUM(debit-credit) AS balance FROM ledger_lines WHERE account_code=1110",
        )
      )[0].balance,
    ),
  ).toBe(0);
});
async function advance(a, amount) {
  const r = await requestAdvance(a, { amount });
  expect(
    (await a.api("POST", "employees/payroll/requests/" + r.id + "/approve", {}))
      .status,
  ).toBe(200);
}
test("VENDOR-004 supplier settlement tracks distinct user identity and normalized cent retries", async ({
  audit,
}) => {
  await audit.pool.query(
    "INSERT INTO users(id,email,password_hash,full_name,role,status,ledger_account_code) VALUES(100,'distinct-owner@audit.invalid','unused','Distinct Owner','owner','active',3009)",
  );
  audit.actors.owner.token = audit.sign({ id: 100, role: "owner" });
  await audit.pool.query(
    "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount) VALUES($1,1,'Bill',1)",
    [audit.DATE],
  );
  const values = {
    vendorId: 1,
    amount: 0.999,
    paymentMode: "Cash",
    reference: "distinct-actor",
    notes: "Distinct actor cent settlement",
    paidBy: "Distinct Owner",
  };
  const r = await audit.api("POST", "vendors/payments", values);
  expect(r.status).toBe(200);
  expect(
    (
      await audit.rows(
        "SELECT amount,created_by,created_by_user_id FROM vendor_payments",
      )
    )[0],
  ).toEqual({ amount: "1.00", created_by: null, created_by_user_id: 100 });
  expect(
    (await audit.api("POST", "vendors/payments", { ...values, amount: 1 })).body
      .payment.id,
  ).toBe(r.body.payment.id);
  expect(await audit.rows("SELECT id FROM vendor_payments")).toHaveLength(1);
  await journal(audit, "VendorPayment", r.body.payment.id, [
    { account: 2000, debit: 1, credit: 0 },
    { account: 1000, debit: 0, credit: 1 },
  ]);
});
test("BILL-001 BILL-005 zero-cost bill approval and rejection create no fictitious liability", async ({
  audit,
}) => {
  const r = await audit.api("POST", "chicken/bills", {
    date: audit.DATE,
    supplier_id: 1,
    item_name: "Audit Chicken",
    qty: 2,
    vendor_rate: 0,
  });
  expect(r.status).toBe(200);
  for (const status of ["Approved", "Rejected"])
    expect(
      (
        await audit.api("PATCH", "chicken/bills/" + r.body.id + "/status", {
          status,
        })
      ).status,
    ).toBe(200);
  expect(await audit.rows("SELECT id FROM vendor_ledger")).toHaveLength(0);
  expect(await audit.rows("SELECT id FROM journal_entries")).toHaveLength(0);
});
test("PAY-004 PAY-010 PAY-011 negative payout recovers full debt and tracks settlement, reversal, repayout and deletion", async ({
  audit,
  page,
}) => {
  await advance(audit, 40000);
  const draft = await generate(audit);
  expect(draft.status).toBe(200);
  const id = draft.body.data[0].id;
  expect(Number(draft.body.data[0].net_pay)).toBe(-10000);
  expect((await audit.api("POST", "payroll/approve", { id })).status).toBe(200);
  expect((await paid(audit, id)).status).toBe(200);
  await journal(audit, "PayrollShortfall", id, [
    { account: 1110, debit: 10000, credit: 0 },
    { account: 6100, debit: 0, credit: 10000 },
  ]);
  await journal(audit, "AdvanceRepayment", id, [
    { account: 6100, debit: 40000, credit: 0 },
    { account: 1100, debit: 0, credit: 40000 },
  ]);
  expect(
    await audit.rows(
      "SELECT id FROM journal_entries WHERE reference_type='SalaryPayment'",
    ),
  ).toHaveLength(0);
  expect(
    (await audit.api("GET", "employees/payroll/advances/1/balance")).body
      .balance,
  ).toBe(0);
  const short = (await audit.api("GET", "payroll/shortfalls")).body[0];
  expect(short.amount).toBe("10000.00");
  expect(short.created_by).toBe(audit.actors.owner.user.id);
  await audit.session(page);
  await page.goto("/employee-balances");
  await page
    .getByRole("button", { name: "Settle shortfall #" + short.id })
    .click();
  await page.getByLabel("Shortfall settlement amount").fill("2000");
  await page
    .getByLabel("Shortfall payment reference")
    .fill("negative-pay-test");
  await page
    .getByRole("button", { name: "Record settlement", exact: true })
    .click();
  await expect(
    page.getByText("Shortfall settlement recorded", { exact: true }),
  ).toBeVisible();
  await journal(audit, "PayrollShortfallSettlement", "negative-pay-test", [
    { account: 1000, debit: 2000, credit: 0 },
    { account: 1110, debit: 0, credit: 2000 },
  ]);
  const settlement = (
    await audit.rows("SELECT * FROM payroll_shortfall_settlements")
  )[0];
  expect(
    (
      await audit.api("POST", "payroll/shortfalls/" + short.id + "/settle", {
        amount: 2000,
        reference: "negative-pay-test",
        paymentMode: "Cash",
      })
    ).body.id,
  ).toBe(settlement.id);
  const tables = [
    "salary_history",
    "salary_advances",
    "advance_ledger",
    "journal_entries",
    "ledger_lines",
    "payroll_shortfalls",
    "payroll_shortfall_settlements",
  ];
  const before = await snapshot(audit, tables);
  expect(
    (
      await audit.api("POST", "payroll/revert/" + id, {
        targetStatus: "Approved",
        reason: "Correction",
      })
    ).status,
  ).toBe(409);
  expect(await snapshot(audit, tables)).toEqual(before);
  expect(
    (
      await audit.api(
        "POST",
        "payroll/shortfalls/" +
          short.id +
          "/settlements/" +
          settlement.id +
          "/reverse",
        { reason: "Incorrect receipt" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await audit.api("POST", "payroll/revert/" + id, {
        targetStatus: "Approved",
        reason: "Correction",
      })
    ).status,
  ).toBe(200);
  expect(
    (await audit.api("GET", "employees/payroll/advances/1/balance")).body
      .balance,
  ).toBe(40000);
  expect(
    (await audit.rows("SELECT status FROM payroll_shortfalls"))[0].status,
  ).toBe("Reversed");
  expect((await paid(audit, id)).status).toBe(200);
  expect(
    await audit.rows("SELECT id FROM payroll_shortfalls WHERE status='Open'"),
  ).toHaveLength(1);
  expect(
    (
      await audit.api("DELETE", "payroll/" + id, {
        reason: "Remove erroneous period",
      })
    ).status,
  ).toBe(200);
  expect(
    await audit.rows("SELECT id FROM payroll_shortfalls WHERE status='Open'"),
  ).toHaveLength(0);
  expect(
    (await audit.api("GET", "employees/payroll/advances/1/balance")).body
      .balance,
  ).toBe(40000);
  expect(
    Number(
      (
        await audit.rows(
          "SELECT COALESCE(sum(debit-credit),0) AS balance FROM ledger_lines WHERE account_code=1110",
        )
      )[0].balance,
    ),
  ).toBe(0);
});
test("PAY-005 PAY-012 both payroll APIs share draft and payout state without duplicate cash postings", async ({
  audit,
}) => {
  const first = await audit.api("POST", "employees/payroll/run", {
    employeeId: 1,
    month: 11,
    year: 2026,
    daysWorked: 0,
  });
  expect(first.status).toBe(200);
  expect(Number(first.body.netPay)).toBe(0);
  expect(await audit.rows("SELECT id FROM journal_entries")).toHaveLength(0);
  const generated = await generate(audit),
    id = generated.body.data[0].id;
  expect((await audit.api("POST", "payroll/approve", { id })).status).toBe(200);
  expect((await paid(audit, id)).status).toBe(200);
  const before = await snapshot(audit);
  expect(
    (
      await audit.api("POST", "employees/payroll/run", {
        employeeId: 1,
        month: 11,
        year: 2026,
        daysWorked: 15,
      })
    ).status,
  ).toBe(200);
  expect(await snapshot(audit)).toEqual(before);
});
test("LEAVE-004 LEAVE-006 mixed attendance counts approved paid leave once and protects overlap", async ({
  audit,
}) => {
  for (const [type, date] of [
    ["Paid", "2026-11-09"],
    ["Unpaid", "2026-11-10"],
  ]) {
    const r = await audit.api("POST", "leaves", {
      employee_id: 1,
      leave_type: type,
      start_date: date,
      end_date: date,
    });
    expect(r.status).toBe(200);
    expect(
      (await audit.api("PUT", "leaves/" + r.body.id + "/approve", {})).status,
    ).toBe(200);
  }
  await audit.pool.query(
    "INSERT INTO attendance(employee_id,date,status) VALUES(1,'2026-11-11','Present'),(1,'2026-11-12','Half-Day')",
  );
  const r = await audit.api("POST", "payroll/run", {
    employeeId: 1,
    month: 11,
    year: 2026,
  });
  expect(r.status).toBe(200);
  expect(Number(r.body.data[0].days_worked)).toBe(2.5);
  expect(Number(r.body.data[0].calculated_salary)).toBe(2500);
  expect(Number(r.body.data[0].paid_leave_days)).toBe(1);
  const conflicting = await audit.api("POST", "leaves", {
    employee_id: 1,
    leave_type: "Unpaid",
    start_date: "2026-11-09",
    end_date: "2026-11-09",
  });
  const before = await snapshot(audit, [
    "leave_requests",
    "attendance",
    "attendance_audit_log",
  ]);
  expect(
    (await audit.api("PUT", "leaves/" + conflicting.body.id + "/approve", {}))
      .status,
  ).toBe(409);
  expect(
    await snapshot(audit, [
      "leave_requests",
      "attendance",
      "attendance_audit_log",
    ]),
  ).toEqual(before);
});
test("PAY-001 missing attendance remains explicit and inactive employees are excluded", async ({
  audit,
  page,
}) => {
  await audit.pool.query("UPDATE employees SET status='inactive' WHERE id=3");
  const r = await audit.api("POST", "payroll/run", { month: 11, year: 2026 });
  expect(r.status).toBe(200);
  expect(r.body.data.map((d) => d.employee_id)).toEqual([1, 2]);
  expect(r.body.data.every((d) => d.attendance_missing)).toBe(true);
  await audit.session(page);
  await page.goto("/payroll");
  await expect(
    page.getByText("Attendance missing: full month assumed").first(),
  ).toBeVisible();
});
test("POS-003 POS-004 POS-006 discounts, tax, customer, table, notes and partial settlement persist through browser flow", async ({
  audit,
  page,
}) => {
  const tax = (
    await audit.rows(
      "SELECT id FROM tax_rates WHERE rate_percentage=0.05 LIMIT 1",
    )
  )[0];
  await audit.pool.query("UPDATE menu_items SET tax_rate_id=$1 WHERE id=1", [
    tax.id,
  ]);
  expect((await audit.api('POST','config/dining_tables',{value:'A7',label:'Table A7',display_order:1})).status).toBe(201);
  await audit.login(page);
  await audit.openTable(page,'A7');
  await page
    .getByRole("button", { name: "Audit Chicken Bowl ₹250.00" })
    .click();
  await page.getByLabel("Customer name").fill("Test Customer");
  await page.getByLabel("Customer phone").fill("9876500011");
  await page.getByLabel("Order notes").fill("Less spice");
  await page.getByLabel("Order discount").fill("50");
  await page.getByText("Part", { exact: true }).click();
  await page.getByLabel("Amount paid now").fill("100");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.getByText("Order Saved!", { exact: true })).toBeVisible();
  const o = (await audit.rows("SELECT * FROM orders"))[0];
  expect(o).toMatchObject({
    order_type: "Dine In",
    table_number: "A7",
    notes: "Less spice",
    subtotal: "250.00",
    discount_amount: "50.00",
    tax_amount: "10.00",
    total_amount: "210.00",
    paid_amount: "100.00",
    payment_status: "Part",
  });
  await journal(audit, "POSOrder", o.id, [
    { account: 1000, debit: 100, credit: 0 },
    { account: 1120, debit: 110, credit: 0 },
    { account: 4000, debit: 0, credit: 200 },
    { account: 2100, debit: 0, credit: 10 },
  ]);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Pay order #" + o.id }).click();
  await page
    .getByRole("button", { name: "Collect payment", exact: true })
    .click();
  await expect(
    page.getByText("Order payment recorded", { exact: true }),
  ).toBeVisible();
  expect(
    (await audit.rows("SELECT paid_amount,payment_status FROM orders"))[0],
  ).toEqual({ paid_amount: "210.00", payment_status: "Paid" });
  const p = (
    await audit.rows(
      "SELECT * FROM payment_transactions WHERE idempotency_key IS NOT NULL",
    )
  )[0];
  await journal(audit, "OrderSettlement", p.id, [
    { account: 1000, debit: 110, credit: 0 },
    { account: 1120, debit: 0, credit: 110 },
  ]);
});
test("POS-004 POS-005 due checkout and competing settlements reconcile debt without double collection", async ({
  audit,
}) => {
  const sale = await order(audit, {
    paymentMethod: "Due",
    customerPhone: "9876500012",
    type: "Delivery",
    notes: "Ring doorbell",
  });
  expect(sale.status).toBe(200);
  expect(sale.body.outstanding).toBe(250);
  await journal(audit, "POSOrder", sale.body.orderId, [
    { account: 1120, debit: 250, credit: 0 },
    { account: 4000, debit: 0, credit: 250 },
  ]);
  expect(await audit.rows("SELECT id FROM payment_transactions")).toHaveLength(
    0,
  );
  const data = { amount: 150, paymentMode: "Card" };
  const results = await Promise.all(
    ["collect-a", "collect-b"].map((key) =>
      audit.api(
        "POST",
        "orders/" + sale.body.orderId + "/payments",
        data,
        "staff",
        { "Idempotency-Key": key },
      ),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const key = results[0].status === 200 ? "collect-a" : "collect-b";
  expect(
    (
      await audit.api(
        "POST",
        "orders/" + sale.body.orderId + "/payments",
        data,
        "staff",
        { "Idempotency-Key": key },
      )
    ).status,
  ).toBe(200);
  expect(await audit.rows("SELECT id FROM payment_transactions")).toHaveLength(
    1,
  );
  expect(
    (await audit.rows("SELECT total_amount-paid_amount AS due FROM orders"))[0]
      .due,
  ).toBe("100.00");
});
test("POS-005 invalid discounts, malformed customer data and oversized partial payments roll back", async ({
  audit,
}) => {
  const before = await snapshot(audit);
  for (const changes of [
    { discount: 251 },
    { discount: -1 },
    { paymentMethod: "Due", customerPhone: 123 },
    { paymentMethod: "Part", customerPhone: "999", amountPaid: 300 },
    { type: "Invalid" },
  ])
    expect((await order(audit, changes)).status).toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
test("POS-009 browser retry after a lost response creates one order and one ticket", async ({
  audit,
  page,
}) => {
  await audit.login(page);
  await audit.openTable(page);
  await page.getByRole("button", { name: "Audit Rice Bowl ₹100.00" }).click();
  let intercepted = false;
  await page.route("**/api/orders", async (route) => {
    if (!intercepted) {
      intercepted = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(
    page.getByText("Failed to save order. Retry with the same details.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.getByText("Order Saved!", { exact: true })).toBeVisible();
  expect(await audit.rows("SELECT id FROM orders")).toHaveLength(1);
  expect(await audit.rows("SELECT id FROM kds_tickets")).toHaveLength(1);
});
test("POS-007 KDS-001 KDS-002 recipe editor drives stock costing and kitchen transitions", async ({
  audit,
  page,
}) => {
  await audit.session(page);
  await page.goto("/recipes");
  await page.getByLabel("Recipe menu item").selectOption("1");
  await page.getByLabel("Quantity per serving 1").fill("0.5");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByText("Recipe saved", { exact: true })).toBeVisible();
  const sale = await order(audit, { notes: "No salt", tableNumber: "B2" });
  expect(sale.status).toBe(200);
  await journal(audit, "COGS", sale.body.orderId, [
    { account: 5000, debit: 100, credit: 0 },
    { account: 1200, debit: 0, credit: 100 },
  ]);
  expect(
    Number(
      (await audit.rows("SELECT stock_qty FROM inventory_items WHERE id=1"))[0]
        .stock_qty,
    ),
  ).toBe(19.5);
  await page.goto("/kitchen");
  await expect(page.getByText("Notes: No salt")).toBeVisible();
  await page
    .getByRole("button", { name: "Start preparing", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(page.getByText("No active kitchen tickets")).toBeVisible();
  const ticket = (await audit.rows("SELECT * FROM kds_tickets"))[0];
  expect(ticket.started_at).not.toBeNull();
  expect(ticket.completed_at).not.toBeNull();
  expect(ticket.updated_by).toBe(audit.actors.owner.user.id);
  expect(
    (
      await audit.api("PUT", "kds/tickets/" + ticket.id, {
        status: "Preparing",
      })
    ).status,
  ).toBe(409);
});
test("PO-001 PO-003 browser creates and receives purchase order exactly once and prevents cancelled receipt", async ({
  audit,
  page,
}) => {
  await audit.session(page);
  await page.goto("/purchase-orders");
  await page.getByLabel("Purchase order supplier").selectOption("1");
  await page.getByLabel("Purchase item 1").selectOption("1");
  await page.getByLabel("Purchase quantity 1").fill("2");
  await page.getByLabel("Purchase unit cost 1").fill("150");
  await page
    .getByRole("button", { name: "Create purchase order", exact: true })
    .click();
  await expect(
    page.getByText("Purchase order created", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send PO #1", exact: true }).click();
  await page
    .getByRole("button", { name: "Receive PO #1", exact: true })
    .click();
  await expect(
    page.getByText("Purchase order received", { exact: true }),
  ).toBeVisible();
  await journal(audit, "PurchaseOrder", 1, [
    { account: 1200, debit: 300, credit: 0 },
    { account: 2000, debit: 0, credit: 300 },
  ]);
  const before = await snapshot(audit);
  expect(
    (await audit.api("PUT", "inventory/po/1/status", { status: "Received" }))
      .status,
  ).toBe(200);
  expect(await snapshot(audit)).toEqual(before);
  const o = await audit.api("POST", "inventory/po", {
    supplier_id: 1,
    items: [{ inventory_item_id: 2, qty: 1, unit_cost: 50 }],
  });
  expect(o.status).toBe(200);
  expect(
    (
      await audit.api("PUT", "inventory/po/" + o.body.id + "/status", {
        status: "Cancelled",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await audit.api("PUT", "inventory/po/" + o.body.id + "/status", {
        status: "Received",
      })
    ).status,
  ).toBe(409);
});
test("INV-005 INV-002 browser logs fractional wastage and stock adjustments with source-linked valuation", async ({
  audit,
  page,
}) => {
  await audit.session(page);
  await page.goto("/wastage");
  await page.getByLabel("Stock item").selectOption("1");
  await page.getByLabel("Wasted quantity").fill("0.25");
  await page.getByLabel("Stock reason").fill("Spilled");
  await page.getByRole("button", { name: "Log wastage", exact: true }).click();
  await expect(page.getByText("Wastage logged", { exact: true })).toBeVisible();
  await journal(audit, "Wastage", 1, [
    { account: 6000, debit: 37.5, credit: 0 },
    { account: 1200, debit: 0, credit: 37.5 },
  ]);
  await page.goto("/stock-adjustments");
  await page.getByLabel("Stock item").selectOption("1");
  await page.getByLabel("Quantity change").fill("-0.5");
  await page.getByLabel("Stock reason").fill("Count correction");
  await page
    .getByRole("button", { name: "Record adjustment", exact: true })
    .click();
  await expect(page.getByText("Stock adjusted", { exact: true })).toBeVisible();
  await journal(audit, "StockAdjustment", 1, [
    { account: 6200, debit: 75, credit: 0 },
    { account: 1200, debit: 0, credit: 75 },
  ]);
  expect(
    Number(
      (await audit.rows("SELECT stock_qty FROM inventory_items WHERE id=1"))[0]
        .stock_qty,
    ),
  ).toBe(19.25);
  const tables = [
    "inventory_items",
    "stock_adjustments",
    "stock_movements",
    "inventory_transactions",
    "wastage_logs",
    "journal_entries",
    "ledger_lines",
  ];
  const before = await snapshot(audit, tables);
  expect(
    (
      await audit.api("POST", "inventory/adjustments", {
        inventory_item_id: 1,
        quantity_change: -30,
        reason: "Bad count",
      })
    ).status,
  ).toBe(400);
  expect(await snapshot(audit, tables)).toEqual(before);
});
test("GL-002 per-line cent rounding prevents stored journals from becoming unbalanced", async ({
  audit,
}) => {
  const before = await snapshot(audit, ["journal_entries", "ledger_lines"]);
  const bad = await audit.service("JournalService", "createJournalEntry", {
    date: audit.DATE,
    description: "Subcent",
    lines: [
      { account_code: 1000, debit: 0.006 },
      { account_code: 1010, debit: 0.006 },
      { account_code: 4000, credit: 0.012 },
    ],
  });
  expect(bad.ok).toBe(false);
  expect(await snapshot(audit, ["journal_entries", "ledger_lines"])).toEqual(
    before,
  );
});
test("TRACK-003 competing corrections use the latest locked transaction snapshot", async ({
  audit,
}) => {
  const r = await audit.api("POST", "finance/tracker/transaction", {
    date: audit.DATE,
    type: "Sales",
    amount: 100,
    payment_method: "Cash",
    status: "Paid",
    description: "Concurrent correction",
  });
  expect(r.status).toBe(201);
  const replies = await Promise.all(
    [200, 300].map((amount) =>
      audit.api("PUT", "finance/tracker/transaction/" + r.body.id, { amount }),
    ),
  );
  expect(replies.map((r) => r.status)).toEqual([200, 200]);
  const final = Number(
    (
      await audit.rows("SELECT amount FROM transactions WHERE id=$1", [
        r.body.id,
      ])
    )[0].amount,
  );
  expect(
    Number(
      (
        await audit.rows(
          "SELECT SUM(debit-credit) AS balance FROM ledger_lines WHERE account_code=1000",
        )
      )[0].balance,
    ),
  ).toBe(final);
});
test("EXPORT-003 PDF contains long report data, repeated headers, Unicode and multiple pages", async ({
  audit,
  page,
}) => {
  for (let i = 0; i < 90; i++)
    await audit.pool.query(
      "INSERT INTO inventory_items(name,stock_qty,unit_cost,unit) VALUES($1,1,2,'kg')",
      ["Long report item " + i],
    );
  await audit.pool.query("UPDATE inventory_items SET name=$1 WHERE id=1", [
    "रसोई",
  ]);
  await audit.session(page);
  await page.goto("/reports/inventory");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export as PDF", exact: true })
    .click();
  const d = await waiting,
    file = await d.path();
  expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
  const parsed = JSON.parse(
    execFileSync(
      path.resolve(".venv/bin/python"),
      ["scripts/extract-audit-pdf.py", file],
      { encoding: "utf8" },
    ),
  );
  audit.check("Paginated PDF", parsed);
  expect(parsed.pages).toBeGreaterThan(1);
  expect(parsed.text).toContain("रसोई");
  expect(parsed.text).toContain("Long report item 89");
  expect(parsed.text).toContain("Page 1 of");
});
test("AUTH-006 operations writes and employee debts reject staff access", async ({
  audit,
}) => {
  for (const [method, url, data] of [
    ["PUT", "inventory/recipes/1", { ingredients: [] }],
    [
      "POST",
      "inventory/adjustments",
      { inventory_item_id: 1, quantity_change: 1, reason: "Role test" },
    ],
    ["POST", "inventory/po", { supplier_id: 1, items: [] }],
    ["POST", "wastage", { inventory_item_id: 1, qty: 1, reason: "Role test" }],
    ["GET", "payroll/shortfalls"],
  ])
    expect((await audit.api(method, url, data, "staff")).status).toBe(403);
});
test("ADV-002 ADV-005 PAY-007 PAY-011 scheduled advance disburses once and payroll recovery restores exact installments", async ({
  audit,
}) => {
  const request = await audit.api(
    "POST",
    "advance-requests",
    {
      employee_id: 1,
      requested_amount: 1000,
      reason: "Scheduled advance",
      repayment_months: 3,
    },
    "staff",
  );
  expect(request.status).toBe(200);
  const approval = await audit.api(
    "PUT",
    "advance-requests/" + request.body.id + "/approve",
    { approved_amount: 1000, repayment_months: 3, payment_mode: "Cash" },
    "manager",
  );
  expect(approval.status).toBe(200);
  await journal(audit, "AdvanceAdvance", request.body.id, [
    { account: 1100, debit: 1000, credit: 0 },
    { account: 1000, debit: 0, credit: 1000 },
  ]);
  let schedule = (
    await audit.api(
      "GET",
      "advance-requests/" + request.body.id + "/repayment-schedule",
    )
  ).body;
  expect(schedule.map((s) => s.scheduled_amount)).toEqual([
    "333.33",
    "333.33",
    "333.34",
  ]);
  expect(
    (
      await audit.api(
        "PUT",
        "advance-requests/" + request.body.id + "/approve",
        { approved_amount: 1000, repayment_months: 3 },
      )
    ).status,
  ).toBe(409);
  const manual = await requestAdvance(audit, {
    type: "Repayment",
    amount: 200,
  });
  expect(
    (
      await audit.api(
        "POST",
        "employees/payroll/requests/" + manual.id + "/approve",
        {},
      )
    ).status,
  ).toBe(200);
  schedule = (
    await audit.api(
      "GET",
      "advance-requests/" + request.body.id + "/repayment-schedule",
    )
  ).body;
  expect(schedule[0]).toMatchObject({
    recovered_amount: "200.00",
    status: "Partial",
  });
  const draft = await generate(audit),
    id = draft.body.data[0].id;
  expect(Number(draft.body.data[0].advance_deduction)).toBe(800);
  expect((await audit.api("POST", "payroll/approve", { id })).status).toBe(200);
  expect((await paid(audit, id)).status).toBe(200);
  expect(
    (
      await audit.api(
        "GET",
        "advance-requests/" + request.body.id + "/repayment-schedule",
      )
    ).body.every((s) => s.status === "Paid"),
  ).toBe(true);
  expect(
    (
      await audit.api("POST", "payroll/revert/" + id, {
        targetStatus: "Approved",
        reason: "Schedule restoration",
      })
    ).status,
  ).toBe(200);
  schedule = (
    await audit.api(
      "GET",
      "advance-requests/" + request.body.id + "/repayment-schedule",
    )
  ).body;
  expect(schedule.map((s) => s.recovered_amount)).toEqual([
    "200.00",
    "0.00",
    "0.00",
  ]);
  expect(schedule.map((s) => s.status)).toEqual([
    "Partial",
    "Pending",
    "Pending",
  ]);
  expect((await paid(audit, id)).status).toBe(200);
  expect(
    (await audit.api("GET", "employees/payroll/advances/1/balance")).body
      .balance,
  ).toBe(0);
});
test("PAY-004 subcent shortfall settlements normalize before status and retry comparisons", async ({
  audit,
}) => {
  await advance(audit, 30001);
  const draft = await generate(audit),
    id = draft.body.data[0].id;
  expect((await audit.api("POST", "payroll/approve", { id })).status).toBe(200);
  expect((await paid(audit, id)).status).toBe(200);
  const short = (await audit.api("GET", "payroll/shortfalls")).body[0];
  expect(
    (
      await audit.api("POST", "payroll/shortfalls/" + short.id + "/settle", {
        amount: 0.999,
        paymentMode: "Cash",
        reference: "rounded-settlement",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await audit.rows("SELECT status,settled_amount FROM payroll_shortfalls")
    )[0],
  ).toEqual({ status: "Settled", settled_amount: "1.00" });
  expect(
    (
      await audit.api("POST", "payroll/shortfalls/" + short.id + "/settle", {
        amount: 1,
        paymentMode: "Cash",
        reference: "rounded-settlement",
      })
    ).status,
  ).toBe(200);
});
test("INV-001 INV-002 initial inventory and ordinary quantity/cost edits journal exact valuation", async ({
  audit,
}) => {
  const created = await audit.api("POST", "inventory", {
    name: "Valuation Item",
    stock_qty: 2,
    unit_cost: 10,
    unit: "kg",
  });
  expect(created.status).toBe(201);
  await journal(audit, "StockAdjustment", 1, [
    { account: 1200, debit: 20, credit: 0 },
    { account: 6200, debit: 0, credit: 20 },
  ]);
  const edit = await audit.api("PUT", "inventory/" + created.body.id, {
    name: "Valuation Item",
    stock_qty: 3,
    unit_cost: 15,
    unit: "kg",
  });
  expect(edit.status).toBe(200);
  await journal(audit, "StockAdjustment", 2, [
    { account: 1200, debit: 10, credit: 0 },
    { account: 6200, debit: 0, credit: 10 },
  ]);
  await journal(audit, "StockRevaluation", 1, [
    { account: 1200, debit: 15, credit: 0 },
    { account: 6200, debit: 0, credit: 15 },
  ]);
  const revalue = (await audit.rows("SELECT * FROM stock_revaluations"))[0];
  expect(revalue).toMatchObject({
    previous_cost: "10.00",
    new_cost: "15.00",
    value_change: "15.00",
    created_by: audit.actors.owner.user.id,
  });
  await audit.pool.query(
    "INSERT INTO financial_periods(name,start_date,end_date,status) VALUES('Locked test','2026-11-01','2026-11-30','Locked')",
  );
  const before = await snapshot(audit);
  expect(
    (
      await audit.api("PUT", "inventory/" + created.body.id, {
        name: "Valuation Item",
        stock_qty: 4,
        unit_cost: 15,
        unit: "kg",
      })
    ).status,
  ).toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
test("PO-001 zero-cost purchase receipt adds stock without invalid zero journals", async ({
  audit,
}) => {
  const r = await audit.api("POST", "inventory/po", {
    supplier_id: 1,
    items: [{ inventory_item_id: 1, qty: 1, unit_cost: 0 }],
  });
  expect(r.status).toBe(200);
  expect(
    (
      await audit.api("PUT", "inventory/po/" + r.body.id + "/status", {
        status: "Received",
      })
    ).status,
  ).toBe(200);
  expect(
    Number(
      (await audit.rows("SELECT stock_qty FROM inventory_items WHERE id=1"))[0]
        .stock_qty,
    ),
  ).toBe(21);
  expect(
    await audit.rows(
      "SELECT id FROM journal_entries WHERE reference_type='PurchaseOrder'",
    ),
  ).toHaveLength(0);
  expect(await audit.rows("SELECT id FROM vendor_ledger")).toHaveLength(0);
  expect(
    (
      await audit.rows(
        "SELECT qty_received FROM purchase_order_items WHERE po_id=$1",
        [r.body.id],
      )
    )[0].qty_received,
  ).toBe("1.00");
  expect(
    await audit.rows(
      "SELECT quantity_change FROM stock_movements WHERE details=$1",
      ["PO #" + r.body.id],
    ),
  ).toEqual([{ quantity_change: "1.0000" }]);
  const before = await snapshot(audit);
  expect(
    (
      await audit.api("PUT", "inventory/po/" + r.body.id + "/status", {
        status: "Received",
      })
    ).status,
  ).toBe(200);
  expect(await snapshot(audit)).toEqual(before);
});
test("VENDOR-004 GL-002 legacy payment uses supplier settlement and generic journal deletion preserves source history", async ({
  audit,
}) => {
  await audit.pool.query(
    "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount) VALUES($1,1,'Bill',100)",
    [audit.DATE],
  );
  const r = await audit.api("POST", "finance/payment", {
    supplierId: 1,
    amount: 60,
    paymentMode: "Card",
    details: "Legacy screen settlement",
  });
  expect(r.status).toBe(200);
  await journal(audit, "VendorPayment", r.body.payment.id, [
    { account: 2000, debit: 60, credit: 0 },
    { account: 1010, debit: 0, credit: 60 },
  ]);
  const before = await snapshot(audit);
  expect(
    (
      await audit.api(
        "DELETE",
        "finance/transaction/" + r.body.payment.journal_entry_id,
      )
    ).status,
  ).toBe(409);
  expect(await snapshot(audit)).toEqual(before);
});
