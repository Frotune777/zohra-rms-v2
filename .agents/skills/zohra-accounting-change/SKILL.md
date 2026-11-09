---
name: zohra-accounting-change
description: Review or implement requested Zohra RMS v2 changes to journals, payments, inventory valuation, closures, employee advances or payroll while tracing the affected source models and financial contracts. Use when a change affects money, balances, financial periods or payroll state.
---

# Zohra accounting change

Read the relevant sections of [accounting and HR](../../../docs/repository/accounting-and-hr.md), [feature routing](../../../docs/repository/feature-routing.md), and [decisions](../../../docs/repository/decisions.md). These separate observed implementation from intended contracts and policies that still need a business answer. Historical [domain invariants](../../../docs/llm/DOMAIN_INVARIANTS.md) describe intent; they are not proof of enforcement.

For refunds, repayment/stock reversals, cent-accurate weighted average and canonical initialization, read [corrections and valuation](../../../docs/repository/corrections-and-valuation.md). Exact source allocations and recorded stock values must survive later payroll/receipt writers. Full-order refunds have an explicit unused-stock choice; Preparing/Done food never automatically returns to stock.

For table definitions, incompatible migrations or importer changes, use [data and migrations](../../../docs/repository/data-and-migrations.md).

## Trace the actual writer

Start from the affected route and service. Finance paths coexist: [JournalService](../../../server/src/modules/finance/JournalService.js), [TransactionService](../../../server/src/modules/finance/TransactionService.js), [ClosureService](../../../server/src/modules/finance/ClosureService.js), [TransferService](../../../server/src/modules/finance/TransferService.js), and the legacy [finance service](../../../server/src/modules/finance/service.js). Vendor payments and procurement have their own services under `server/src/modules/vendors` and `server/src/modules/inventory`. Do not assume all writes reach the journal engine.

HR exposes multiple namespaces: [employee advances](../../../server/src/modules/employees/AdvanceService.js), [employee payroll](../../../server/src/modules/employees/PayrollService.js), and standalone `advance-requests`, `payroll`, `attendance` and `leaves` modules. Trace the caller's namespace, source tables, statuses, recovery fields and journal linkage before changing one model. Both payroll APIs now use shared drafts and the payout lifecycle. Scheduled approvals use AdvanceService and installment allocations; inspect their source and reversal links when adjusting balances.

## Preserve the requested contract

For the affected operation, identify source rows, account mappings, period/day locks, stock or advance movements, actor attribution, and retry/concurrency behavior. Carry related writes through one transaction and verify failure rollback across the whole operation. The existing code contains paths that commit partially; an HTTP success alone is insufficient evidence.

Use finite monetary values and cent-level reconciliation. Journals need valid accounts, at least two distinct lines, balanced debits/credits and the expected source reference. Corrections should use reversals rather than mutating posted ledger history. Check reversals against the specific source and employee/account, especially when dates match. These are intended integrity requirements whose present violations are documented in phase 2.

The user confirmed Paid leave earns salary, recovery has no salary cap, and negative employee payouts need tracking. Payroll preserves signed net pay; negative processing creates a source-linked shortfall on account 1110 without cash movement. Asset-account wallet overdrafts are tracked separately. POS uses fixed discounts before tax and receivables on 1120. Missing-attendance and owner Equity-transfer semantics remain separate policy questions; consult the maintained decision record and current user instructions. The audit bootstrap's legacy “Bank Transfer” expense mapping is not the contract for an internal asset transfer.

## Verify the effect

Use the relevant `tests/audit` financial or HR reproductions and their [source-linked journal/snapshot helpers](../../../tests/audit/helpers.cjs) on the guarded disposable cluster. Keep full-run evidence before filtered reruns because the reporter overwrites its default results. Targeted unit checks may supplement persisted-state checks; global ledger balance, mocks and successful GETs do not establish conservation or atomicity.

Check the requested operation and its reversal/retry or competing writer where relevant. Record exact API status, journal lines, cash/bank/vendor/employee balances, and unchanged state after rejection. Update the maintained contract and its remaining audit scope when behavior changes. Do not certify a complete feature from passing subcases.

This skill does not authorize unrelated repairs, live migrations or business-data changes. Follow the user's current scope and existing authorization.
