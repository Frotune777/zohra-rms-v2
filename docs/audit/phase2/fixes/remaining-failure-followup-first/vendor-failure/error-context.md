# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: corrections.spec.cjs >> AUTH-006 VENDOR-004 vendor APIs enforce management permission and end-only ledger filters work
- Location: tests/audit/corrections.spec.cjs:595:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
  545 |     ).status,
  546 |   ).toBe(200);
  547 |   const before = await snapshot(audit);
  548 |   expect(
  549 |     (
  550 |       await audit.api(
  551 |         "POST",
  552 |         "inventory/adjustments/" + a.body.id + "/reverse",
  553 |         { reason: "Correct addition" },
  554 |       )
  555 |     ).status,
  556 |   ).toBe(409);
  557 |   expect(await snapshot(audit)).toEqual(before);
  558 | });
  559 | test("INV-001 INV-002 REPORT-003 recorded stock value survives unchanged rounded-cost edits", async ({
  560 |   audit,
  561 | }) => {
  562 |   const created = await audit.api("POST", "inventory", {
  563 |     name: "Cent stock",
  564 |     stock_qty: 0.03,
  565 |     unit_cost: 0.33,
  566 |     unit: "kg",
  567 |   });
  568 |   expect(created.status).toBe(201);
  569 |   const stored = (
  570 |     await audit.rows("SELECT * FROM inventory_items WHERE id=$1", [
  571 |       created.body.id,
  572 |     ])
  573 |   )[0];
  574 |   expect(created.body.stock_value).toBe(stored.stock_value);
  575 |   expect(created.body.stock_qty).toBe(stored.stock_qty);
  576 |   await audit.pool.query(
  577 |     "UPDATE inventory_items SET stock_value=3000.09 WHERE id=1",
  578 |   );
  579 |   const before = await snapshot(audit, ["journal_entries", "ledger_lines"]);
  580 |   const edit = await audit.api("PUT", "inventory/1", {
  581 |     name: "Audit Chicken",
  582 |     stock_qty: 20,
  583 |     unit_cost: 150,
  584 |     unit: "kg",
  585 |   });
  586 |   expect(edit.status).toBe(200);
  587 |   expect(Number(edit.body.stock_value)).toBe(3000.09);
  588 |   expect(await snapshot(audit, ["journal_entries", "ledger_lines"])).toEqual(
  589 |     before,
  590 |   );
  591 |   const report = await audit.api("GET", "reports/inventory/stock-status");
  592 |   expect(report.status).toBe(200);
  593 |   expect(JSON.stringify(report.body)).toContain("3000.09");
  594 | });
  595 | test("AUTH-006 VENDOR-004 vendor APIs enforce management permission and end-only ledger filters work", async ({
  596 |   audit,
  597 | }) => {
  598 |   await audit.pool.query(
  599 |     "INSERT INTO vendor_ledger(date,supplier_id,transaction_type,amount) VALUES('2026-11-01',1,'Bill',100),('2026-11-09',1,'Bill',200)",
  600 |   );
  601 |   const before = await snapshot(audit);
  602 |   for (const path of [
  603 |     "vendors/payments",
  604 |     "vendors/1/outstanding",
  605 |     "vendors/1/ledger",
  606 |     "vendors/reports/aging",
  607 |     "vendors/all-suppliers",
  608 |   ])
  609 |     expect((await audit.api("GET", path, undefined, "staff")).status).toBe(403);
  610 |   expect(
  611 |     (
  612 |       await audit.api(
  613 |         "POST",
  614 |         "vendors/payments",
  615 |         {
  616 |           vendorId: 1,
  617 |           amount: 50,
  618 |           paymentMode: "Cash",
  619 |           reference: "staff-payment",
  620 |         },
  621 |         "staff",
  622 |       )
  623 |     ).status,
  624 |   ).toBe(403);
  625 |   expect(await snapshot(audit)).toEqual(before);
  626 |   const ledger = await audit.api(
  627 |     "GET",
  628 |     "vendors/1/ledger?endDate=2026-11-05",
  629 |     undefined,
  630 |     "manager",
  631 |   );
  632 |   expect(ledger.status).toBe(200);
  633 |   expect(ledger.body.map((l) => Number(l.amount))).toEqual([100]);
  634 |   const payment = await audit.api(
  635 |     "POST",
  636 |     "vendors/payments",
  637 |     {
  638 |       vendorId: 1,
  639 |       amount: 50,
  640 |       paymentMode: "Cash",
  641 |       reference: "manager-payment",
  642 |     },
  643 |     "manager",
  644 |   );
> 645 |   expect(payment.status).toBe(200);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  646 |   expect(payment.body.payment.notes).toBe("");
  647 |   expect(
  648 |     await audit.rows(
  649 |       "SELECT vp.notes, vl.details FROM vendor_payments vp JOIN vendor_ledger vl ON vl.payment_id=vp.id WHERE vp.id=$1",
  650 |       [payment.body.payment.id],
  651 |     ),
  652 |   ).toEqual([{ notes: "", details: "" }]);
  653 |   await journal(audit, "VendorPayment", payment.body.payment.id, [
  654 |     { account: 2000, debit: 50, credit: 0 },
  655 |     { account: 1000, debit: 0, credit: 50 },
  656 |   ]);
  657 | });
  658 | 
```