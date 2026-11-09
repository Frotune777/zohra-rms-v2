# Jest expansion verification

The completed standalone run added **366 tests** to the preceding 190-test checkpoint: **556 passed, 0 failed, 0 skipped across 25 suites**. Default Babel coverage passes the unchanged 70% thresholds: statements **81.95%**, branches **74.47%**, functions **78.09%**, lines **82.90%**.

[Verification](verification.json) records the exact command, suite counts, coverage denominators and source/test hashes. [Results](results.json) retain every assertion outcome; [coverage data](coverage-final.json) retain uncovered locations. The [repository test guide](../../../repository/jest-testing.md) explains isolation, quality checks, reproduction and scenario ownership.

## Reproduced defects and corrections

| Trigger | Observed defect | Corrected contract and regression |
| --- | --- | --- |
| Read an SQL DATE, then correct/delete the tracker row | Local-midnight Date conversion could shift the calendar day and fail the locked reread | Pool-scoped DATE text parser preserves YYYY-MM-DD; tracker calendar/controlled-lock tests. TIMESTAMP parsing remains unchanged. |
| Retry a stored 80.00 transaction with numeric 80; change JSON metadata | Numeric retries created extra reversals/history; String(object) could suppress distinct metadata changes | Cent/ID/day comparisons and deep metadata equality; identical retry snapshot, distinct metadata persistence and reordered-key retry tests |
| Import a batch whose later option lacks label, or send malformed config fields | Required-field database failure returned500 | Prevalidate option/batch/reorder shapes and return400; scoped duplicate update returns409. AFTER-trigger batch failure still proves rollback of prior upserts. |
| Create a leave with a type outside the five UI choices | API accepted the unsupported type | Validate Sick/Casual/Paid/Unpaid/Emergency and return400 before insertion; all five choices tested. No entitlement or additional pay policy inferred. |
| Aggregate suppliers with opening 50 and 10 across five ledger events | Opening balance became170 and outstanding275 instead of60 and165 | Aggregate ledger events per supplier before category totals; date filters retain opening-only suppliers. Exact totals and empty-window regression. |
| Supply a numeric/object receipt reference or numeric reversal reason | TypeError returned500 | Require string/nonblank input and return400 without financial changes; reference reuse, exact source, final-cent and late rollback tests |
| Fail next-day closure insertion or reopen audit after variance writes | Unexpected database failure was reported400 | Expected domain closure errors remain400; unexpected failures return500. Full before/after snapshots establish variance/closure rollback. |

The [first expanded run](first-expanded-results.json), [shortfall follow-up](shortfall-followup-results.json) and [financial follow-up](financial-followup-results.json) retain failed assertions. Test fixture mistakes were also corrected: payroll component order is not insertion-order guaranteed; zero balances use positive zero; missing-source refund setup changes references without violating a journal foreign key; JSON-aggregated bigint IDs are numbers in these synthetic fixtures; canonical payment-mode names are lowercase; dependency failure injection must target the report query after authentication. These corrections retain exact business expectations. Earlier tracker/config failure excerpts are stored alongside these results.

## Quality and limits

Successful integration operations use real migrations, PostgreSQL, Express and authentication. Assertions cover exact source journals and cash/debt/stock conservation, caller-owned rollback, late SQL-trigger failures, actor identity, idempotency, permissions and controlled competing writes. Monetary expectations are independent of the posting implementation. No thresholds, exclusions, retries or timeouts were weakened.

This is scenario coverage, not an exhaustive feature certification. [Remaining instrumented paths](remaining-instrumented-paths.json) record statement/branch/function coverage per source file; they are not a missing-feature list. The browser checklist retains partial scope. Historical/custom migrations, full socket delivery, every locale/timezone and every concurrent interleaving remain outside these claims. The preceding 439-case browser/190-test coverage checkpoint is [archived](../before-jest-expansion/scope.md); new browser results must be assessed against the changed source.

The first post-expansion full browser run passed 437/439 and failed two old status expectations: CLOSE-005 expected 400 for an unexpected audit failure, while CFG-001 expected 500 for malformed import input. [Full-run evidence](playwright-first/results.json) preserves them. The corrected 500/400 expectations both passed with the unchanged rollback snapshots in the [focused follow-up](playwright-followup/results.json). The final complete browser audit passed 439/439; same-source V8 unit/API/browser coverage also passes all four unchanged thresholds. See the current [full results](../results.json) and [combined summary](../server-combined-coverage/summary.json).
