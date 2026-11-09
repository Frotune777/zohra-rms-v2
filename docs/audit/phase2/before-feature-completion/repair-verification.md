# Repairs and verification

Completed on 9 November 2026. The full guarded audit passed 359/362 checks; all 191 original technical failures now pass. The remaining three failures are provisional business rules. All 166 checklist IDs retain explicit partial scope in [coverage](coverage.csv). Historical results remain in [baseline-before-fixes](baseline-before-fixes/results.json) and named [focused artifacts](fixes/).

| Area | Implemented behavior | Executed evidence |
| --- | --- | --- |
| Authentication and access | Real bcrypt credentials, active-account/token checks, current DB roles, strict Bearer scheme, manager owner-creation restriction, screen guards, report/config authorization, CORS and socket authentication | AUTH cases in the complete results |
| POS/menu/inventory | Stored prices, validated integer quantities, atomic available-stock deduction, durable retry keys, checkout payment mode, kitchen ticket creation/reuse, printing, menu edit, nonnegative finite stock/cost/wastage validation | POS/MENU/INV/KDS cases |
| Procurement and settlement | Bill commit before release, serialized approval, source journals, preserved reversals, settlement protection, supplier account allocation, Bank/Card modes, debt/reference locks, corrected running balances and aged debt, PO receipt linkage and repeated receipt protection | RATES/MARKUP/BILL/VENDOR/PO cases |
| Tracker/journals/closure | One transaction for source/journal changes, source-specific reversals and compensating vendor events, correct asset routing, finite journal validation, historical account cutoffs, live closure, scoped reopen, preserved closed next-day balance, period/day guards | FIN/TRACK/MAP/GL/CLOSE cases |
| HR/advances/payroll | Persisted zero/empty employee edits, locked attendance protection, leave ownership, validated schedules, atomic approval/transfer, manual and payroll FIFO balance updates, actor attribution, zero-net payout, exact allocation reversal and repayout | EMP/ATT/LEAVE/ADV/PAY and integrity regressions |
| Reports/config/export/feedback | Reversal-aware and inclusive-date aggregates, proportional half-days, scoped config updates, preserved inactive options, correct report URL, visible request errors/toasts, escaped/formula-safe CSV and released Blob URLs | REPORT/DASH/AI/CFG/EXPORT/SCREEN/UI cases |
| Python import | Durable file-byte-hash/row markers for bill/CSV retry, malformed-row discrepancies, attendance-success guard before employee status synchronization | DATA-001 and E2E round-trip reached assertions |

The seven [integrity regressions](../../../tests/audit/integrity-regressions.spec.cjs) separately verify manual FIFO fields and processed rejection; deduction-bearing payout/revert/repayout restoration; payroll/manual-request ID collision isolation; concurrent payout/correction; null-reference historic/import journal totals; and both Locked and Closed period rejection of pending purchases with unchanged stock/source state.

## Test repairs

The finance mapping test now locates Sales and Expense by type rather than assuming UUID sort order equals creation order. E2E-002 uses the actually registered PATCH bill-status and vendors/payments endpoints. Server fixtures now reset per case and use SQL-aware ancillary responses, so new guard queries cannot consume a source-row response. Unexpected SQL fails those mocks. Auth tests use real bcrypt hashes and current active user fixtures; the previous conditional hashing assertion was replaced with an unconditional insert lookup and bcrypt comparison. Client payment tests use real icons and the current modal heading.

POS unit verification now checks the final total UPDATE rather than the initial zero-total order INSERT. AI's low-stock fixture is below the independently calculated reorder point (1 versus 2.14); zero stock with zero measured demand asserts the existing zero-reorder-point behavior. These corrections do not decide a new forecasting policy. No failed cases were skipped, suppressed, or marked expected-failure.

[Server unit results](server-unit-results.json) contain 185 passing assertions; [client unit results](client-unit-results.json) contain 50. The production build passes ([log](build-verification.txt)). The unchanged server coverage gate still fails: statements 55.37%, branches 39.02%, lines 57.33%, functions 48.45%, each against 70%. This is an outstanding verification requirement, not a passing check.

## Remaining boundaries

The three business decisions are [recorded explicitly](../../repository/decisions.md): Paid leave earnings, permitted wallet overdrafts, and recovery beyond gross salary. Their assertions remain failing and provisional; no new policy was imposed.

The source review also identifies competing employee-payroll cash generation against shared standalone history, tracker snapshots read before row locks, and aggregate versus per-line sub-cent journal rounding. These are documented source gaps that need persisted-state reproduction and repairs; the named tests do not prove every legacy or competing writer safe. Full browser CRUD, role/event delivery, modal/keyboard behavior, deterministic races, production migration, existing-data upgrade and cross-browser/PostgreSQL 15/container checks remain incomplete.

Import retry identity uses exact file bytes plus row index; a modified/re-encoded file has a new identity even when logical rows repeat. Existing historical imports require a separate reconciliation/backfill procedure. The selected 042/043 bootstrap does not establish that procedure.

The refreshed [source manifest](../../repository/source-manifest.json) establishes the reviewed checkpoint. It does not declare any feature complete. No business-data migration, deployment or commit was performed.
