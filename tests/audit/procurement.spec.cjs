const { test, expect } = require("./fixtures.cjs");
const {
  snapshot,
  journal,
  billFixture,
  raceWrites,
  order,
} = require("./helpers.cjs");
const rateBody = {
  date: "2026-11-09",
  tandoor_rate: 150,
  boiler_rate: 100,
  egg_rate: 6,
};
const billBody = {
  date: "2026-11-09",
  supplier_id: 1,
  item_name: "Audit Chicken",
  qty: 2,
  vendor_rate: 160,
};
async function rule(audit, values) {
  const r = await audit.api("POST", "chicken/markups", {
    supplier_id: 1,
    item_name: "Audit Chicken",
    base_rate_type: "TandoorRate",
    op1: "+",
    val1: 0,
    ...values,
  });
  expect(r.status).toBe(200);
  return r.body;
}
async function payable(audit, amount = 1000, date = audit.DATE) {
  await audit.pool.query(
    "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount,details) VALUES($1,1,'Bill',$2,'Audit payable')",
    [date, amount],
  );
}
async function payment(
  audit,
  amount = 100,
  mode = "Cash",
  reference = "audit-payment",
) {
  return audit.api("POST", "vendors/payments", {
    vendorId: 1,
    amount,
    paymentMode: mode,
    reference,
    notes: "Audit settlement",
    paidBy: "Audit owner",
  });
}
test("RATES-001 complete, partial and repeated rate saves persist date-specific state", async ({
  audit,
}) => {
  for (const [values, status] of [
    [rateBody, "confirmed"],
    [{ ...rateBody, tandoor_rate: 0 }, "pending"],
    [rateBody, "confirmed"],
  ]) {
    const r = await audit.api("POST", "chicken/rates", values);
    expect(r.status).toBe(200);
    const stored = await audit.api("GET", "chicken/rates?date=" + values.date);
    expect(stored.status).toBe(200);
    expect(stored.body.status).toBe(status);
    expect(Number(stored.body.tandoor_rate)).toBe(values.tandoor_rate);
  }
  expect(await audit.rows("SELECT date FROM daily_rates")).toHaveLength(1);
});
for (const bad of [-1, "NaN", "Infinity"])
  test(
    "RATES-002 invalid rate " +
      bad +
      " is rejected without changing stored rates",
    async ({ audit }) => {
      const before = await snapshot(audit, ["daily_rates"]);
      expect
        .soft(
          (
            await audit.api("POST", "chicken/rates", {
              ...rateBody,
              tandoor_rate: bad,
            })
          ).status,
        )
        .toBe(400);
      expect(await snapshot(audit, ["daily_rates"])).toEqual(before);
    },
  );
test("RATES-003 leap-day and year boundaries stay on their requested calendar dates", async ({
  audit,
}) => {
  for (const date of ["2024-02-29", "2025-12-31", "2026-01-01"])
    expect(
      (await audit.api("POST", "chicken/rates", { ...rateBody, date })).status,
    ).toBe(200);
  const r = await audit.api(
    "GET",
    "chicken/rates/calendar?startDate=2024-02-28&endDate=2024-03-01",
  );
  expect(r.status).toBe(200);
  expect(JSON.stringify(r.body)).toContain("2024-02-29");
  expect(
    (await audit.rows("SELECT date::text FROM daily_rates ORDER BY date")).map(
      (r) => r.date,
    ),
  ).toEqual(["2024-02-29", "2025-12-31", "2026-01-01", "2026-11-09"]);
});
test("MARKUP-001 all base rates and arithmetic operations compute independently expected prices", async ({
  audit,
}) => {
  for (const [base, op, value, second, secondValue, expected] of [
    ["TandoorRate", "+", 10, "*", 2, 320],
    ["BoilerRate", "-", 10, "/", 2, 45],
    ["EggRate", "*", 2, "+", 1, 13],
    ["TandoorRate", "/", 3, "-", 5, 45],
  ]) {
    await rule(audit, {
      base_rate_type: base,
      op1: op,
      val1: value,
      op2: second,
      val2: secondValue,
    });
    const r = await audit.api("POST", "chicken/bills", billBody);
    expect(r.status).toBe(200);
    expect(Number(r.body.expected_rate)).toBe(expected);
  }
});
test("MARKUP-002 zero second operands are retained and division by zero is rejected", async ({
  audit,
}) => {
  const stored = await rule(audit, { op1: "+", val1: 10, op2: "*", val2: 0 });
  expect.soft(stored.val2).not.toBeNull();
  const computed = await audit.api("POST", "chicken/bills", billBody);
  expect(computed.status).toBe(200);
  expect.soft(Number(computed.body.expected_rate)).toBe(0);
  expect
    .soft(
      (
        await audit.api("POST", "chicken/markups", {
          supplier_id: 1,
          item_name: "Invalid divisor",
          base_rate_type: "TandoorRate",
          op1: "/",
          val1: 0,
        })
      ).status,
    )
    .toBe(400);
});
test("MARKUP-003 comparator boundaries apply the conditional markup exactly", async ({
  audit,
}) => {
  for (const [operator, threshold, expected] of [
    [">", 150, 150],
    [">=", 150, 160],
    ["<", 150, 150],
    ["<=", 150, 160],
    ["==", 150, 160],
    [">", 149, 160],
    ["<", 151, 160],
  ]) {
    await rule(audit, {
      threshold_val: threshold,
      threshold_op: operator,
      threshold_markup_op: "+",
      threshold_markup_val: 10,
    });
    const r = await audit.api("POST", "chicken/bills", billBody);
    expect(r.status).toBe(200);
    expect(Number(r.body.expected_rate)).toBe(expected);
  }
});
test("MARKUP-004 negative results clamp to zero, decimals round, and duplicate rules update once", async ({
  audit,
}) => {
  for (const [op, value, expected] of [
    ["-", 200, 0],
    ["/", 7, 21.43],
  ]) {
    await rule(audit, { op1: op, val1: value });
    const r = await audit.api("POST", "chicken/bills", billBody);
    expect(r.status).toBe(200);
    expect(Number(r.body.expected_rate)).toBe(expected);
  }
  expect(
    await audit.rows(
      "SELECT id FROM markup_rules WHERE supplier_id=1 AND item_name='Audit Chicken'",
    ),
  ).toHaveLength(1);
  expect((await audit.api("DELETE", "chicken/markups/1")).status).toBe(200);
  expect(await audit.rows("SELECT id FROM markup_rules")).toHaveLength(0);
});
for (const item of ["Audit Chicken", "Unmatched stock item"])
  test(
    "BILL-001 bill success commits on an independent connection for " + item,
    async ({ audit }) => {
      const r = await audit.api("POST", "chicken/bills", {
        ...billBody,
        item_name: item,
      });
      expect(r.status).toBe(200);
      expect(
        await audit.rows("SELECT id FROM bill_entries WHERE id=$1", [
          r.body.id,
        ]),
      ).toHaveLength(1);
      if (item === "Audit Chicken") {
        expect(
          Number(
            (
              await audit.rows(
                "SELECT stock_qty FROM inventory_items WHERE id=1",
              )
            )[0].stock_qty,
          ),
        ).toBe(20);
        expect(
          (
            await audit.api("PATCH", "chicken/bills/" + r.body.id + "/status", {
              status: "Approved",
            })
          ).status,
        ).toBe(200);
        const stock = (
          await audit.rows(
            "SELECT stock_qty,stock_value FROM inventory_items WHERE id=1",
          )
        )[0];
        expect(Number(stock.stock_qty)).toBe(22);
        expect(Number(stock.stock_value)).toBe(3320);
      }
    },
  );
test("BILL-002 missing rates and nonexistent suppliers are rejected without partial writes", async ({
  audit,
}) => {
  const before = await snapshot(audit);
  expect(
    (
      await audit.api("POST", "chicken/bills", {
        ...billBody,
        date: "2020-01-01",
      })
    ).status,
  ).toBe(400);
  expect
    .soft(
      (
        await audit.api("POST", "chicken/bills", {
          ...billBody,
          supplier_id: 99999,
        })
      ).status,
    )
    .toBe(404);
  expect(await snapshot(audit)).toEqual(before);
});
for (const [rate, variance] of [
  [150, -12.5],
  [160, 0],
  [170, 12.5],
])
  test(
    "BILL-003 fractional quantity and vendor rate " +
      rate +
      " persist the exact variance",
    async ({ audit }) => {
      const r = await audit.api("POST", "chicken/bills", {
        ...billBody,
        qty: 1.25,
        vendor_rate: rate,
      });
      expect(r.status).toBe(200);
      expect(Number(r.body.variance)).toBe(variance);
      expect(
        await audit.rows("SELECT variance FROM bill_entries WHERE id=$1", [
          r.body.id,
        ]),
      ).toEqual([{ variance: variance.toFixed(2) }]);
    },
  );
test("BILL-004 repeated and concurrent approvals post one liability and source journal", async ({
  audit,
}) => {
  const bill = await billFixture(audit);
  const responses = await Promise.all([
    audit.api("PATCH", "chicken/bills/" + bill.id + "/status", {
      status: "Approved",
    }),
    audit.api("PATCH", "chicken/bills/" + bill.id + "/status", {
      status: "Approved",
    }),
  ]);
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect
    .soft(
      await audit.rows(
        "SELECT id FROM vendor_ledger WHERE transaction_type='Bill'",
      ),
    )
    .toHaveLength(1);
  await journal(audit, "Bill", bill.id, [
    { account: 1200, debit: 320, credit: 0 },
    { account: 2000, debit: 0, credit: 320 },
  ]);
});
test("BILL-005 approved bill rejection preserves the original liability and posts a reversing event", async ({
  audit,
}) => {
  const bill = await billFixture(audit);
  expect(
    (
      await audit.api("PATCH", "chicken/bills/" + bill.id + "/status", {
        status: "Approved",
      })
    ).status,
  ).toBe(200);
  const original = await audit.rows("SELECT id,amount FROM vendor_ledger");
  expect(original).toHaveLength(1);
  expect(
    (
      await audit.api("PATCH", "chicken/bills/" + bill.id + "/status", {
        status: "Rejected",
      })
    ).status,
  ).toBe(200);
  expect
    .soft(
      await audit.rows("SELECT id,amount FROM vendor_ledger WHERE id=$1", [
        original[0].id,
      ]),
    )
    .toEqual(original);
  expect(
    await audit.rows(
      "SELECT id FROM journal_entries WHERE reference_type='Reversal'",
    ),
  ).toHaveLength(1);
});
test("BILL-006 partly settled bill rejection cannot produce negative supplier outstanding", async ({
  audit,
}) => {
  const bill = await billFixture(audit);
  expect(
    (
      await audit.api("PATCH", "chicken/bills/" + bill.id + "/status", {
        status: "Approved",
      })
    ).status,
  ).toBe(200);
  expect((await payment(audit, 100)).status).toBe(200);
  const r = await audit.api("PATCH", "chicken/bills/" + bill.id + "/status", {
    status: "Rejected",
  });
  audit.check("Rejected partially paid bill response", {
    status: r.status,
    body: r.body,
  });
  const [balance] = await audit.rows(
    "SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id=1",
  );
  expect(Number(balance.outstanding_balance)).toBeGreaterThanOrEqual(0);
});
test("BILL-007 closed-period bill creation is rejected without bill or inventory changes", async ({
  audit,
}) => {
  await audit.pool.query(
    "INSERT INTO financial_periods(name,start_date,end_date,status) VALUES('Audit locked','2026-11-01','2026-11-30','Locked')",
  );
  const before = await snapshot(audit);
  expect
    .soft((await audit.api("POST", "chicken/bills", billBody)).status)
    .toBe(400);
  expect(await snapshot(audit)).toEqual(before);
});
test("VENDOR-001 supplier profile edits preserve opening balance and linked account", async ({
  audit,
}) => {
  const r = await audit.api("PUT", "chicken/suppliers/1", {
    name: "Edited Supplier",
    phone: "123",
    vendor_type: "Chicken",
    payment_type: "Cash",
    markup_required: false,
    opening_balance: 500,
    notes: "Edited",
  });
  expect(r.status).toBe(200);
  const [row] = await audit.rows(
    "SELECT name,opening_balance,ledger_account_code FROM suppliers WHERE id=1",
  );
  expect(row.name).toBe("Edited Supplier");
  expect.soft(Number(row.opening_balance)).toBe(500);
  expect(row.ledger_account_code).toBe(2000);
});
test("VENDOR-002 concurrent supplier creation assigns two distinct durable accounts", async ({
  audit,
}) => {
  const responses = await raceWrites(
    audit,
    "chart_of_accounts",
    ["A", "B"].map(
      (name) => () =>
        audit.api("POST", "chicken/suppliers", {
          name: "Concurrent " + name,
          vendor_type: "Chicken",
          markup_required: false,
        }),
    ),
  );
  expect.soft(responses.map((r) => r.status)).toEqual([200, 200]);
  const rows = await audit.rows(
    "SELECT ledger_account_code FROM suppliers WHERE name LIKE 'Concurrent %'",
  );
  expect.soft(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r.ledger_account_code)).size).toBe(2);
});
for (const [mode, account] of [
  ["Cash", 1000],
  ["UPI", 1020],
  ["Bank Transfer", 1010],
  ["Card", 1010],
])
  test(
    "VENDOR-003 partial and full " +
      mode +
      " settlements reconcile payment, supplier and journal",
    async ({ audit }) => {
      await payable(audit, 1000);
      const first = await payment(audit, 400, mode);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.newBalance).toBe(600);
      await journal(audit, "VendorPayment", first.body.payment.id, [
        { account: 2000, debit: 400, credit: 0 },
        { account, debit: 0, credit: 400 },
      ]);
      const second = await payment(audit, 600, mode, "audit-second");
      expect(second.status).toBe(200);
      expect(second.body.newBalance).toBe(0);
    },
  );
for (const amount of [0, -1, 1001])
  test(
    "VENDOR-004 invalid settlement " +
      amount +
      " leaves payment, supplier and GL unchanged",
    async ({ audit }) => {
      await payable(audit);
      const before = await snapshot(audit);
      expect.soft((await payment(audit, amount)).status).toBe(400);
      expect(await snapshot(audit)).toEqual(before);
    },
  );
test("VENDOR-005 two jointly excessive concurrent payments cannot over-settle a supplier", async ({
  audit,
}) => {
  await payable(audit, 1000);
  const replies = await raceWrites(audit, "vendor_payments", [
    () => payment(audit, 600, "Cash", "one"),
    () => payment(audit, 600, "Cash", "two"),
  ]);
  expect.soft(replies.filter((r) => r.status === 200)).toHaveLength(1);
  expect(
    Number(
      (
        await audit.rows(
          "SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id=1",
        )
      )[0].outstanding_balance,
    ),
  ).toBe(400);
});
test("VENDOR-006 retrying a settlement reference never duplicates payment or journal", async ({
  audit,
}) => {
  await payable(audit);
  await payment(audit, 100, "Cash", "same-reference");
  await payment(audit, 100, "Cash", "same-reference");
  expect
    .soft(
      await audit.rows(
        "SELECT id FROM vendor_payments WHERE reference_number='same-reference'",
      ),
    )
    .toHaveLength(1);
  expect(
    await audit.rows(
      "SELECT id FROM journal_entries WHERE reference_type='VendorPayment'",
    ),
  ).toHaveLength(1);
});
test("VENDOR-007 date-filtered running balance includes prior bills and subtracts payments", async ({
  audit,
}) => {
  await audit.pool.query("UPDATE suppliers SET opening_balance=100 WHERE id=1");
  await payable(audit, 500, "2026-10-01");
  await audit.pool.query(
    "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount) VALUES('2026-11-09',1,'Payment',200)",
  );
  const r = await audit.api(
    "GET",
    "vendors/1/running-balance?startDate=2026-11-01&endDate=2026-11-30",
  );
  expect(r.status).toBe(200);
  expect.soft(r.body.opening_balance).toBe(600);
  expect(r.body.closing_balance).toBe(400);
});
test("VENDOR-008 a fully settled supplier has zero outstanding aged debt", async ({
  audit,
}) => {
  await payable(audit, 1000, "2026-08-01");
  expect((await payment(audit, 1000)).status).toBe(200);
  const r = await audit.api("GET", "vendors/1/details");
  expect(r.status).toBe(200);
  expect(Number(r.body.outstanding_balance)).toBe(0);
  expect(Object.values(r.body.aging).reduce((sum, n) => sum + n, 0)).toBe(0);
});
test("VENDOR-009 supplier settlements use that supplier account instead of a shared payable", async ({
  audit,
}) => {
  await audit.pool.query(
    "INSERT INTO chart_of_accounts(code,name,type) VALUES(2011,'Audit supplier payable','Liability')",
  );
  await audit.pool.query(
    "UPDATE suppliers SET ledger_account_code=2011 WHERE id=1",
  );
  await payable(audit);
  const r = await payment(audit, 100);
  expect(r.status).toBe(200);
  await journal(audit, "VendorPayment", r.body.payment.id, [
    { account: 2011, debit: 100, credit: 0 },
    { account: 1000, debit: 0, credit: 100 },
  ]);
});
test("PO-001 receiving multiple items records quantities, movements, liability and source journal", async ({
  audit,
}) => {
  const r = await audit.api("POST", "chicken/po", {
    supplier_id: 1,
    items: [
      { inventory_item_id: 1, qty: 2, unit_cost: 150 },
      { inventory_item_id: 2, qty: 4, unit_cost: 50 },
    ],
  });
  expect(r.status).toBe(200);
  expect(Number(r.body.total_amount)).toBe(500);
  expect(
    (
      await audit.api("PUT", "chicken/po/" + r.body.id + "/status", {
        status: "Sent",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await audit.api("PUT", "chicken/po/" + r.body.id + "/status", {
        status: "Received",
      })
    ).status,
  ).toBe(200);
  expect(
    (await audit.rows("SELECT stock_qty FROM inventory_items ORDER BY id")).map(
      (r) => Number(r.stock_qty),
    ),
  ).toEqual([22, 14]);
  expect
    .soft(await audit.rows("SELECT id FROM stock_movements"))
    .toHaveLength(2);
  await journal(audit, "PurchaseOrder", r.body.id, [
    { account: 1200, debit: 500, credit: 0 },
    { account: 2000, debit: 0, credit: 500 },
  ]);
});
test("PO-002 resetting and re-receiving a PO never adds its stock or liability twice", async ({
  audit,
}) => {
  const r = await audit.api("POST", "chicken/po", {
    supplier_id: 1,
    items: [{ inventory_item_id: 1, qty: 2, unit_cost: 150 }],
  });
  expect(r.status).toBe(200);
  for (const status of ["Received", "Received", "Sent", "Received"])
    await audit.api("PUT", "chicken/po/" + r.body.id + "/status", { status });
  expect
    .soft(
      Number(
        (
          await audit.rows("SELECT stock_qty FROM inventory_items WHERE id=1")
        )[0].stock_qty,
      ),
    )
    .toBe(22);
  expect(
    await audit.rows("SELECT id FROM vendor_ledger WHERE details=$1", [
      "PO #" + r.body.id + " Received",
    ]),
  ).toHaveLength(1);
});
test("KDS-001 ticket transitions persist timestamps and reject unsupported status values", async ({
  audit,
}) => {
  const sale = await order(audit);
  expect(sale.status).toBe(200);
  const r = await audit.api("POST", "kds/tickets", {
    orderId: sale.body.orderId,
    items: [{ id: 1, qty: 1 }],
  });
  expect(r.status).toBe(200);
  for (const status of ["Preparing", "Done"])
    expect(
      (await audit.api("PUT", "kds/tickets/" + r.body.id, { status })).status,
    ).toBe(200);
  const [ticket] = await audit.rows(
    "SELECT started_at,completed_at,status FROM kds_tickets WHERE id=$1",
    [r.body.id],
  );
  expect(ticket.started_at).not.toBeNull();
  expect(ticket.completed_at).not.toBeNull();
  expect(ticket.status).toBe("Done");
  expect
    .soft(
      (
        await audit.api("PUT", "kds/tickets/" + r.body.id, {
          status: "garbage",
        })
      ).status,
    )
    .toBe(400);
});
test("KDS-002 a POS sale appears automatically as one kitchen ticket", async ({
  audit,
}) => {
  const sale = await order(audit);
  expect(sale.status).toBe(200);
  expect(
    await audit.rows("SELECT id FROM kds_tickets WHERE order_id=$1", [
      sale.body.orderId,
    ]),
  ).toHaveLength(1);
});
