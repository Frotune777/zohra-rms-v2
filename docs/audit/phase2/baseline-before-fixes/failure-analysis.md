# Analysis of failed tests

Analysed on 9 November 2026 from the complete run ending at 03:27:12 UTC. **194 of 355 Playwright tests failed**, containing 312 recorded assertion errors. There were no skips or timeouts. These are failed tests, not 194 independent defects: aliases, data variants, shared UI controls and downstream failures repeat the same causes.

The [complete failed-test list](failed-tests.csv) contains every exact title, checklist ID, test location, classification, diagnosis, source file and assertion error. [Structured analysis](failure-analysis.json) includes reached evidence and rejected API calls. Its results SHA-256 ties this interpretation to [the original complete results](results.json); this analysis did not rerun or overwrite that report. Read [remaining coverage](coverage.csv) before treating an entire checklist ID as verified.

[Analysis validation](analysis-validation.json) records exact failed-test inventory matching, preserved execution hashes, dependency consistency, source freshness, skill/link checks and application startup evidence.

## Failed suites

| Suite | Failed | Passed | What failed |
| --- | ---: | ---: | --- |
| [Authentication](../../../../tests/audit/auth.spec.cjs) | 9 | 2 | Demo-password bypass, inactive/deleted access, wrong JWT scheme, direct-page roles, manager-created owners, anonymous reports, CORS/sockets and wrong-password feedback. |
| [POS, menu and inventory](../../../../tests/audit/pos-inventory.spec.cjs) | 18 | 7 | Client prices trusted, Card saved as Cash, stock below zero, duplicated checkout retry, missing printing/editing, invalid inventory/wastage, missing movement links and error statuses. |
| [Procurement and vendors](../../../../tests/audit/procurement.spec.cjs) | 31 | 6 | Uncommitted bills, approval/rejection history, duplicated PO receipts, code/payment races, payment-mode mismatch, incorrect running balances/aging, rate/markup validation and KDS integration. |
| [Finance and journals](../../../../tests/audit/finance.spec.cjs) | 27 | 16 | Wrong tracker accounts, partial posting, stale journals, day-lock bypass, closure scope/rollback, invalid journals, repeated reversals and zero/equity balance errors. |
| [HR, leave, advances and payroll](../../../../tests/audit/hr.spec.cjs) | 30 | 11 | Cleared employee edits, code race, attendance locks/leave overwritten, missing permissions/ownership, repayment race, schedule rounding/dates, payroll recovery/reversal and transition contracts. |
| [Payroll browser payout](../../../../tests/audit/payroll-ui.spec.cjs) | 1 | 0 | Freeform payer name sent to INTEGER paid_by produces HTTP 500. |
| [Reports, configuration and forecast](../../../../tests/audit/reports-config-ai.spec.cjs) | 11 | 4 | Reversal/date/case/half-day aggregates, inactive config management, staff/cross-category writes, partial update and payment/unit labels. |
| [Exports](../../../../tests/audit/exports.spec.cjs) | 7 | 3 | Executable CSV formulas, empty financial export, four toast.info errors and unreleased Blob URLs. |
| [Imports and complete round trips](../../../../tests/audit/data-roundtrip.spec.cjs) | 5 | 2 | Duplicate imports, omitted discrepancies, employee inactivation after missing attendance, purchase commit and payout/revert cash conservation. |
| [Screen states](../../../../tests/audit/screen-states.spec.cjs) | 53 | 77 | 32 programmatic-name checks and 21 missing-feedback checks. Empty/delayed rendering, corrected long-name layout and form-input preservation pass. |
| [Navigation and viewports](../../../../tests/audit/screens.spec.cjs) | 2 | 30 | Manager Float HTTP 500 and Financial Reports HTTP 404; these failures are API integration errors. |
| [Harness and real role logins](../../../../tests/audit/harness.spec.cjs) | 0 | 3 | No failed harness cases. |
| **Total** | **194** | **161** | **355 executed tests** |

## Causes to repair first

1. **Uncommitted bill transactions leak into other requests.** [InventoryService.createBillEntry](../../../../server/src/modules/inventory/service.js#L372) returns after BEGIN without COMMIT, then releases the connection. BILL-001, BILL-003 and E2E-002 fail because the independent observer sees no bill. MARKUP-004 is a cascade: its calculation/upsert assertions pass, but its later deletion is hidden inside the same leaked transaction.

   A separate [real API/database reproduction](bill-transaction-reproduction.json) proved that markup deletion commits normally before bill creation, remains invisible after bill creation, and then becomes committed together with the earlier bill by an unrelated POS sale. This is broader than a missing purchase row. Fix the transaction lifecycle, then rerun all affected writers and rejected-operation snapshots. The reproduction used a separate disposable database and left the user’s running demo untouched.

2. **Authorization is missing at several independent boundaries.** [Auth login](../../../../server/src/modules/auth/controller.js#L9) accepts hardcoded passwords after bcrypt failure; [JWT middleware](../../../../server/src/middleware/auth.js) does not enforce current account status or the Bearer scheme; [reports routes](../../../../server/src/modules/reports/routes.js) omit authentication. Registration allows a manager-created owner; leave/config/advance reads and writes lack ownership/role guards in specific namespaces. HR_WRITE is undefined, so manager approvals fail while owner bypass succeeds. Menu visibility does not prevent direct access. Fix and test browser routes, API roles, employee ownership and sockets separately.

3. **Money and stock writers lack concurrency/retry protection.** POS-008 persists stock **-0.25** after two successful last-stock orders; [POS stock subtraction](../../../../server/src/modules/pos/service.js#L140) is unconditional, so adding a lock alone is insufficient. VENDOR-005 persists **-200** supplier outstanding after two 600 payments against 1,000; ADV-003 similarly leaves **-200** receivable. MAX-ID/code allocation races lose employee/supplier creation, and checkout/payment retries duplicate source rows and journals. Validate available amounts under the same transaction/row lock and enforce durable retry keys.

4. **Financial source and journal state diverge.** [Tracker](../../../../server/src/modules/finance/TransactionService.js) uses employee receivable 1100 for Cash/Bank, omits Bank_Cash transfer journals, commits independently and leaves journals stale after edit/delete. Locked-period failures can still return successful source writes. Mapping rewrites Sales and closed-day history. Reconcile source documents, movement/settlement rows and source-linked journals atomically; a globally balanced ledger does not establish correct account posting.

5. **Payroll recovery and reversal operate on incompatible models.** PAY-007 verifies legacy recovered fields and source journals but modern remaining balances stay **[600, 800] instead of [0, 400]**. [Standalone payroll](../../../../server/src/modules/payroll/controller.js) does not restore/reverse cash journal lines on revert: PAY-010 leaves **-75,000 instead of -45,000**, and PAY-011’s re-payout leaves **-60,000 instead of -30,000**. Revert also changes another employee’s same-date journal description. The browser payer-name mismatch and missing legacy total_days_in_month column are separate contracts that fail before later assertions.

6. **Closure and reports use inconsistent scopes and dates.** Default variance accounts are missing; first summaries omit movements; accountCode is dropped; reopening uses date/type rather than the specific account; carry-forward overwrites already closed records. Reversal can commit before the reopen audit transaction fails. Reports omit opposing reversal lines, include future balance-sheet amounts and omit late-day/half-day data. Fix source/date/account scope and then verify full financial round trips.

## Failures that need careful interpretation

- **19 tests are classified primarily as status-contract failures.** FIN-002 proves rollback even though invalid mapping returns 500 instead of 400. EMP-004 and VENDOR-004 preserve state after rejection. Cash/UPI/Card PAY-009 cases verify exactly one SalaryPayment journal; the rejected repeat returns 500 instead of 409. These results do not prove duplicate payout or failed rollback. Bank Transfer PAY-009 is different: both calls fail and no payout journal is created.
- **53 screen-state failures are repeated UI obligations.** Thirty-two name checks flag unlabeled controls; the shared sidebar close button contributes across protected screens, and Login labels are not associated with inputs. The helper uses getClientRects, which also includes offscreen elements; it is not a full computed accessibility/viewport audit. Twenty-one injected-500 checks lack visible error feedback, while their reload recovery/no-uncaught-error assertions still pass.
- **The two navigation failures are integration defects.** [Manager Float](../../../../server/src/modules/finance/ReconciliationService.js) inserts a daily balance without the account_code required by migration 040; the independent reproduction confirms the NOT NULL error. [FinancialReports](../../../../client/src/pages/reports/FinancialReports.jsx) calls /reports/financial/spending-by-person, while the registered route is under /finance. That failed fetch also explains EXPORT-002’s empty JSON data.
- **Three expectations remain policy-dependent.** LEAVE-006 assumes Paid leave earns pay; TRANSFER-003 assumes wallet overdrafts are forbidden; PAY-004 assumes recovery cannot exceed gross pay. Current behavior is measured, but the requested business rule is not settled. See [the decision record](../../../repository/decisions.md). Technical validation, atomicity and authorization repairs can proceed independently of these policy choices.
- **An early hard failure stops later checks.** E2E-002 stops before approval/settlement/closure. PAY-012 stops at a missing column rather than verifying zero-day pay. The UI payer-name test stops at HTTP 500, before its state assertion. Separate downstream fixtures establish only the assertions they reach.

## Earlier unit-test checkpoint

These are separate from the 194 Playwright failures and were not rerun during this analysis. [Recorded post-upgrade verification](../../verification-results.json) contains **37 failed / 183 server Jest tests** and **4 failed / 50 client Vitest tests**. [All 41 failed unit-test names/messages](unit-failure-checkpoint.csv) are listed separately.

The server failure names were unchanged after dependency upgrades. Client failures fell from nine to four: POS checkout’s old /orders mock assertion and three vendor-list/payment fixture/render cases remain. These unit tests largely mock the database; they cannot prove PostgreSQL behavior. There is no equivalent complete pre-upgrade Playwright run, so the 194 failures cannot all be labelled newly introduced upgrade regressions.

## Manual testing

The [manual demo guide](../../../repository/manual-testing.md) describes the running application, sample accounts, ports and restart command. Real owner/manager/staff browser logins and initial POS rendering were verified; the known feature defects above remain available to reproduce.
