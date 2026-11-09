const { test, expect } = require("./fixtures.cjs");
const { order, requestAdvance, journal, snapshot } = require("./helpers.cjs");
const tables = [
  "orders",
  "order_refunds",
  "payment_transactions",
  "inventory_items",
  "stock_corrections",
  "stock_receipts",
  "journal_entries",
  "ledger_lines",
  "advance_ledger",
  "advance_manual_allocations",
  "advance_repayment_reversals",
  "salary_advances",
  "advance_repayment_schedule",
];
for (const mode of ["Cash", "Due", "Part"])
  test(
    "POS-004 POS-009 " +
      mode +
      " full refund preserves source history and returns exact untouched stock",
    async ({ audit, page }) => {
      await audit.pool.query("UPDATE menu_items SET tax_rate_id=1 WHERE id=1");
      const sale = await order(audit, {
        paymentMethod: mode,
        amountPaid: 50,
        customerPhone: "refund-" + mode,
        discount: 10,
      });
      expect(sale.status).toBe(200);
      if (mode !== "Cash")
        expect(
          (
            await audit.api(
              "POST",
              "orders/" + sale.body.orderId + "/payments",
              { amount: 20, paymentMode: "Card" },
              "staff",
              { "Idempotency-Key": "collect" },
            )
          ).status,
        ).toBe(200);
      await audit.session(page);
      await page.goto("/orders");
      await page
        .getByRole("button", {
          name: "Refund order #" + sale.body.orderId,
          exact: true,
        })
        .click();
      await page.getByLabel("Correction reason").fill("Wrong order");
      await page.getByLabel("Return unused ingredients").check();
      await page
        .getByRole("button", { name: "Confirm correction", exact: true })
        .click();
      await expect(
        page.getByText("Correction recorded", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await audit.rows("SELECT stock_qty FROM inventory_items ORDER BY id")
        ).map((r) => Number(r.stock_qty)),
      ).toEqual([20, 10]);
      const refund = (await audit.rows("SELECT * FROM order_refunds"))[0];
      expect(refund.created_by).toBe(audit.actors.owner.user.id);
      expect(Number(refund.amount)).toBe(
        Number(sale.body.paidAmount) + (mode === "Cash" ? 0 : 20),
      );
      expect(
        (
          await audit.rows(
            "SELECT SUM(debit-credit) AS balance FROM ledger_lines",
          )
        )[0].balance,
      ).toBe("0.00");
      for (const account of [1000, 1010, 1120, 1200, 4000, 2100, 5000])
        expect(
          Number(
            (
              await audit.rows(
                "SELECT COALESCE(SUM(debit-credit),0) AS balance FROM ledger_lines WHERE account_code=$1",
                [account],
              )
            )[0].balance,
          ),
        ).toBe(0);
      expect(
        (
          await audit.api(
            "POST",
            "orders/" + sale.body.orderId + "/payments",
            { amount: 1 },
            "staff",
            { "Idempotency-Key": "after-refund" },
          )
        ).status,
      ).toBe(409);
    },
  );
test("POS-007 cooked refund retains consumed stock; competing retries refund once", async ({
  audit,
}) => {
  const sale = await order(audit);
  expect(sale.status).toBe(200);
  const ticket = (await audit.rows("SELECT * FROM kds_tickets"))[0];
  expect(
    (
      await audit.api("PUT", "kds/tickets/" + ticket.id, {
        status: "Preparing",
      })
    ).status,
  ).toBe(200);
  const before = await snapshot(audit, tables);
  expect(
    (
      await audit.api(
        "POST",
        "orders/" + sale.body.orderId + "/refund",
        { reason: "Cooked", returnStock: true },
        "owner",
        { "Idempotency-Key": "bad-return" },
      )
    ).status,
  ).toBe(409);
  expect(await snapshot(audit, tables)).toEqual(before);
  const data = { reason: "Customer cancelled", returnStock: false };
  const responses = await Promise.all(
    ["one", "two"].map((key) =>
      audit.api(
        "POST",
        "orders/" + sale.body.orderId + "/refund",
        data,
        "manager",
        { "Idempotency-Key": key },
      ),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const key = responses[0].status === 200 ? "one" : "two";
  const after = await snapshot(audit, tables);
  expect(
    (
      await audit.api(
        "POST",
        "orders/" + sale.body.orderId + "/refund",
        data,
        "manager",
        { "Idempotency-Key": key },
      )
    ).status,
  ).toBe(200);
  expect(await snapshot(audit, tables)).toEqual(after);
  expect(
    (await audit.rows("SELECT stock_qty FROM inventory_items ORDER BY id")).map(
      (r) => Number(r.stock_qty),
    ),
  ).toEqual([19.75, 9.5]);
  expect(
    await audit.rows(
      "SELECT id FROM journal_entries WHERE reference_type='Reversal' AND reference_id IN (SELECT id::text FROM journal_entries WHERE reference_type='COGS')",
    ),
  ).toHaveLength(0);
});
for (const kind of ["adjustment", "wastage"])
  test(
    "INV-002 INV-005 " +
      kind +
      " browser correction restores exact value after subsequent receipts",
    async ({ audit, page }) => {
      const path = kind === "adjustment" ? "inventory/adjustments" : "wastage";
      const data =
        kind === "adjustment"
          ? { inventory_item_id: 1, quantity_change: -0.25, reason: "Count" }
          : { inventory_item_id: 1, qty: 0.25, reason: "Spilled" };
      const source = await audit.api("POST", path, data);
      expect(source.status).toBe(200);
      const po = await audit.api("POST", "inventory/po", {
        supplier_id: 1,
        items: [{ inventory_item_id: 1, qty: 2, unit_cost: 200 }],
      });
      expect(
        (
          await audit.api("PUT", "inventory/po/" + po.body.id + "/status", {
            status: "Received",
          })
        ).status,
      ).toBe(200);
      await audit.session(page);
      await page.goto(
        kind === "adjustment" ? "/stock-adjustments" : "/wastage",
      );
      await page
        .getByRole("button", {
          name:
            (kind === "adjustment"
              ? "Reverse adjustment #"
              : "Reverse wastage #") + source.body.id,
          exact: true,
        })
        .click();
      await page.getByLabel("Correction reason").fill("Recording error");
      await page
        .getByRole("button", { name: "Confirm correction", exact: true })
        .click();
      await expect(
        page.getByText("Correction recorded", { exact: true }),
      ).toBeVisible();
      const item = (
        await audit.rows("SELECT * FROM inventory_items WHERE id=1")
      )[0];
      expect(Number(item.stock_qty)).toBe(22);
      expect(Number(item.stock_value)).toBe(3400);
      const before = await snapshot(audit, tables);
      expect(
        (
          await audit.api("POST", path + "/" + source.body.id + "/reverse", {
            reason: "Recording error",
          })
        ).status,
      ).toBe(200);
      expect(await snapshot(audit, tables)).toEqual(before);
      expect(
        (await audit.rows("SELECT * FROM stock_corrections"))[0].created_by,
      ).toBe(audit.actors.owner.user.id);
    },
  );
test("ADV-004 ADV-005 manual repayment reversal restores FIFO and installments after payroll recovery", async ({
  audit,
  page,
}) => {
  const req = await audit.api(
    "POST",
    "advance-requests",
    {
      employee_id: 1,
      requested_amount: 1000,
      reason: "Loan",
      repayment_months: 3,
    },
    "staff",
  );
  expect(
    (
      await audit.api("PUT", "advance-requests/" + req.body.id + "/approve", {
        approved_amount: 1000,
        repayment_months: 3,
      })
    ).status,
  ).toBe(200);
  const rep = await requestAdvance(audit, { type: "Repayment", amount: 200 });
  expect(
    (
      await audit.api(
        "POST",
        "employees/payroll/requests/" + rep.id + "/approve",
        {},
      )
    ).status,
  ).toBe(200);
  const draft = await audit.api("POST", "payroll/run", {
    employeeId: 1,
    month: 11,
    year: 2026,
    daysWorked: 30,
  });
  const id = draft.body.data[0].id;
  expect((await audit.api("POST", "payroll/approve", { id })).status).toBe(200);
  expect(
    (
      await audit.api("POST", "payroll/payout", {
        id,
        payment_mode: "Cash",
        payment_date: audit.DATE,
      })
    ).status,
  ).toBe(200);
  await audit.session(page);
  await page.goto("/employee-balances");
  await page
    .getByRole("button", { name: "Reverse repayment #" + rep.id, exact: true })
    .click();
  await page.getByLabel("Correction reason").fill("Wrong repayment");
  await page
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(
    page.getByText("Correction recorded", { exact: true }),
  ).toBeVisible();
  expect(
    (await audit.api("GET", "employees/payroll/advances/1/balance")).body
      .balance,
  ).toBe(200);
  const a = (await audit.rows("SELECT * FROM salary_advances"))[0];
  expect(Number(a.balance_remaining)).toBe(200);
  expect(Number(a.recovered_amount)).toBe(800);
  expect(
    (
      await audit.rows(
        "SELECT recovered_amount FROM advance_repayment_schedule ORDER BY month_number",
      )
    ).map((s) => Number(s.recovered_amount)),
  ).toEqual([133.33, 333.33, 333.34]);
  const before = await snapshot(audit, tables);
  expect(
    (
      await audit.api(
        "POST",
        "employees/payroll/requests/" + rep.id + "/reverse",
        { reason: "Wrong repayment" },
      )
    ).status,
  ).toBe(200);
  expect(await snapshot(audit, tables)).toEqual(before);
});
test("BILL-006 BILL-007 pending approval and rejection conserve quantity, book value and vendor debt", async ({
  audit,
}) => {
  const bill = await audit.api("POST", "inventory/bills", {
    date: audit.DATE,
    supplier_id: 1,
    item_name: "Audit Chicken",
    qty: 2,
    vendor_rate: 200,
  });
  expect(bill.status).toBe(200);
  expect(
    Number(
      (await audit.rows("SELECT stock_qty FROM inventory_items WHERE id=1"))[0]
        .stock_qty,
    ),
  ).toBe(20);
  expect(
    (
      await audit.api("PATCH", "inventory/bills/" + bill.body.id + "/status", {
        status: "Approved",
      })
    ).status,
  ).toBe(200);
  let item = (await audit.rows("SELECT * FROM inventory_items WHERE id=1"))[0];
  expect(Number(item.stock_qty)).toBe(22);
  expect(Number(item.stock_value)).toBe(3400);
  expect(Number(item.unit_cost)).toBe(154.55);
  expect(
    (
      await audit.api("PATCH", "inventory/bills/" + bill.body.id + "/status", {
        status: "Rejected",
      })
    ).status,
  ).toBe(200);
  item = (await audit.rows("SELECT * FROM inventory_items WHERE id=1"))[0];
  expect(Number(item.stock_qty)).toBe(20);
  expect(Number(item.stock_value)).toBe(3000);
  expect(
    Number(
      (await audit.rows("SELECT SUM(amount) AS amount FROM vendor_ledger"))[0]
        .amount,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await audit.rows(
          "SELECT SUM(debit-credit) AS amount FROM ledger_lines WHERE account_code=1200",
        )
      )[0].amount,
    ),
  ).toBe(0);
});
test("PO-001 INV-002 weighted receipt and complete depletion conserve every cent", async ({
  audit,
}) => {
  await audit.pool.query(
    "UPDATE inventory_items SET stock_qty=0.03,unit_cost=0.33 WHERE id=1",
  );
  await audit.pool.query("DELETE FROM recipe_ingredients WHERE menu_item_id=1");
  await audit.pool.query(
    "INSERT INTO recipe_ingredients(menu_item_id,inventory_item_id,quantity_required) VALUES(1,1,0.01)",
  );
  const po = await audit.api("POST", "inventory/po", {
    supplier_id: 1,
    items: [{ inventory_item_id: 1, qty: 0.02, unit_cost: 0.67 }],
  });
  expect(
    (
      await audit.api("PUT", "inventory/po/" + po.body.id + "/status", {
        status: "Received",
      })
    ).status,
  ).toBe(200);
  for (let i = 0; i < 5; i++) expect((await order(audit)).status).toBe(200);
  const item = (
    await audit.rows("SELECT * FROM inventory_items WHERE id=1")
  )[0];
  expect(Number(item.stock_qty)).toBe(0);
  expect(Number(item.stock_value)).toBe(0);
  expect(
    Number(
      (
        await audit.rows(
          "SELECT SUM(debit) AS cost FROM ledger_lines WHERE account_code=5000",
        )
      )[0].cost,
    ),
  ).toBe(0.02);
});
test("AUTH-006 CLOSE-003 corrections reject staff and locked periods without writes", async ({
  audit,
}) => {
  const sale = await order(audit);
  const adj = await audit.api("POST", "inventory/adjustments", {
    inventory_item_id: 1,
    quantity_change: -1,
    reason: "Count",
  });
  const cases = [
    [
      "orders/" + sale.body.orderId + "/refund",
      { reason: "Refund", returnStock: false },
      { "Idempotency-Key": "role" },
    ],
    [
      "inventory/adjustments/" + adj.body.id + "/reverse",
      { reason: "Reverse" },
      {},
    ],
  ];
  for (const [path, data, headers] of cases)
    expect((await audit.api("POST", path, data, "staff", headers)).status).toBe(
      403,
    );
  await audit.pool.query(
    "INSERT INTO financial_periods(name,start_date,end_date,status) VALUES('Locked','2026-11-01','2026-11-30','Locked')",
  );
  const before = await snapshot(audit, tables);
  for (const [path, data, headers] of cases)
    expect((await audit.api("POST", path, data, "owner", headers)).status).toBe(
      400,
    );
  expect(await snapshot(audit, tables)).toEqual(before);
});
test("ADV-004 ADV-005 manual correction restores two FIFO loans and competing reversals apply once", async ({
  audit,
}) => {
  for (const amount of [100, 200]) {
    const a = await requestAdvance(audit, { amount });
    expect(
      (
        await audit.api(
          "POST",
          "employees/payroll/requests/" + a.id + "/approve",
          {},
        )
      ).status,
    ).toBe(200);
  }
  const repayment = await requestAdvance(audit, {
    type: "Repayment",
    amount: 150,
  });
  expect(
    (
      await audit.api(
        "POST",
        "employees/payroll/requests/" + repayment.id + "/approve",
        {},
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await audit.rows(
        "SELECT balance_remaining FROM salary_advances ORDER BY id",
      )
    ).map((a) => Number(a.balance_remaining)),
  ).toEqual([0, 150]);
  const results = await Promise.all(
    [1, 2].map(() =>
      audit.api(
        "POST",
        "employees/payroll/requests/" + repayment.id + "/reverse",
        { reason: "Duplicate receipt" },
      ),
    ),
  );
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(
    await audit.rows("SELECT id FROM advance_repayment_reversals"),
  ).toHaveLength(1);
  expect(
    (
      await audit.rows(
        "SELECT balance_remaining FROM salary_advances ORDER BY id",
      )
    ).map((a) => Number(a.balance_remaining)),
  ).toEqual([100, 200]);
  expect(
    (
      await audit.api(
        "POST",
        "employees/payroll/requests/" + repayment.id + "/reverse",
        { reason: "Different receipt" },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await audit.api(
        "GET",
        "employees/payroll/advances/3/balance",
        undefined,
        "staff",
      )
    ).status,
  ).toBe(403);
  expect(
    (await audit.api("GET", "employees/payroll/advances/3", undefined, "staff"))
      .status,
  ).toBe(403);
  const own = await audit.api(
    "GET",
    "employees/payroll/advances",
    undefined,
    "staff",
  );
  expect(own.status).toBe(200);
  expect(own.body.every((a) => a.employee_id === 1)).toBe(true);
});
test("INV-002 BILL-007 stock return rejects quantity/value deficits atomically", async ({
  audit,
}) => {
  const a = await audit.api("POST", "inventory/adjustments", {
    inventory_item_id: 1,
    quantity_change: 5,
    reason: "Added",
  });
  expect(a.status).toBe(200);
  expect(
    (
      await audit.api("POST", "wastage", {
        inventory_item_id: 1,
        qty: 23,
        reason: "Used",
      })
    ).status,
  ).toBe(200);
  const before = await snapshot(audit);
  expect(
    (
      await audit.api(
        "POST",
        "inventory/adjustments/" + a.body.id + "/reverse",
        { reason: "Correct addition" },
      )
    ).status,
  ).toBe(409);
  expect(await snapshot(audit)).toEqual(before);
});
test("INV-001 INV-002 REPORT-003 recorded stock value survives unchanged rounded-cost edits", async ({
  audit,
}) => {
  const created = await audit.api("POST", "inventory", {
    name: "Cent stock",
    stock_qty: 0.03,
    unit_cost: 0.33,
    unit: "kg",
  });
  expect(created.status).toBe(201);
  const stored = (
    await audit.rows("SELECT * FROM inventory_items WHERE id=$1", [
      created.body.id,
    ])
  )[0];
  expect(created.body.stock_value).toBe(stored.stock_value);
  expect(created.body.stock_qty).toBe(stored.stock_qty);
  await audit.pool.query(
    "UPDATE inventory_items SET stock_value=3000.09 WHERE id=1",
  );
  const before = await snapshot(audit, ["journal_entries", "ledger_lines"]);
  const edit = await audit.api("PUT", "inventory/1", {
    name: "Audit Chicken",
    stock_qty: 20,
    unit_cost: 150,
    unit: "kg",
  });
  expect(edit.status).toBe(200);
  expect(Number(edit.body.stock_value)).toBe(3000.09);
  expect(await snapshot(audit, ["journal_entries", "ledger_lines"])).toEqual(
    before,
  );
  const report = await audit.api("GET", "reports/inventory/stock-status");
  expect(report.status).toBe(200);
  expect(JSON.stringify(report.body)).toContain("3000.09");
});
test("AUTH-006 VENDOR-004 vendor APIs enforce management permission and end-only ledger filters work", async ({
  audit,
}) => {
  await audit.pool.query(
    "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount) VALUES('2026-11-01',1,'Bill',100),('2026-11-09',1,'Bill',200)",
  );
  const before = await snapshot(audit);
  for (const path of [
    "vendors/payments",
    "vendors/1/outstanding",
    "vendors/1/ledger",
    "vendors/reports/aging",
    "vendors/all-suppliers",
  ])
    expect((await audit.api("GET", path, undefined, "staff")).status).toBe(403);
  expect(
    (
      await audit.api(
        "POST",
        "vendors/payments",
        {
          vendorId: 1,
          amount: 50,
          paymentMode: "Cash",
          reference: "staff-payment",
        },
        "staff",
      )
    ).status,
  ).toBe(403);
  expect(await snapshot(audit)).toEqual(before);
  const ledger = await audit.api(
    "GET",
    "vendors/1/ledger?endDate=2026-11-05",
    undefined,
    "manager",
  );
  expect(ledger.status).toBe(200);
  expect(ledger.body.map((l) => Number(l.amount))).toEqual([100]);
  const missingPayer = await audit.api(
    "POST",
    "vendors/payments",
    { vendorId: 1, amount: 50, paymentMode: "Cash" },
    "manager",
  );
  expect(missingPayer.status).toBe(400);
  expect(missingPayer.body.error).toContain("Paid by");
  expect(await snapshot(audit)).toEqual(before);
  const payment = await audit.api(
    "POST",
    "vendors/payments",
    {
      vendorId: 1,
      amount: 50,
      paymentMode: "Cash",
      reference: "manager-payment",
      paidBy: "Audit Manager",
    },
    "manager",
  );
  expect(payment.status).toBe(200);
  expect(payment.body.payment.notes).toBe("");
  expect(
    await audit.rows(
      "SELECT vp.notes, vl.details FROM vendor_payments vp JOIN vendor_ledger vl ON vl.payment_id=vp.id WHERE vp.id=$1",
      [payment.body.payment.id],
    ),
  ).toEqual([{ notes: "", details: "" }]);
  await journal(audit, "VendorPayment", payment.body.payment.id, [
    { account: 2000, debit: 50, credit: 0 },
    { account: 1000, debit: 0, credit: 50 },
  ]);
});
