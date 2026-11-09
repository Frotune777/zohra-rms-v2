# Current failed-test analysis

Completed run: 362 tests; 359 passed; 3 failed or timed out. Exact evidence: [results](results.json), [failed tests](failed-tests.csv), and [coverage](coverage.csv).

The original 355-test run (161 passed / 194 failed) and its diagnoses remain in [baseline-before-fixes](baseline-before-fixes/failure-analysis.md). Current technical repairs and verification limits are documented in [repair verification](repair-verification.md).

| Test | Reached failure and decision needed | Source |
| --- | --- | --- |
| TRANSFER-003 | Wallet returns are transactional but do not reject insufficient funds. The no-overdraft expectation remains an unanswered business rule. | [TransferService.js](../../../server/src/modules/finance/TransferService.js) |
| LEAVE-006 | Paid leave approval records Absent and payroll counts Present/Half-Day. The assertion that Paid leave earns salary remains provisional until the user confirms leave-pay rules. | [controller.js](../../../server/src/modules/leaves/controller.js), [controller.js](../../../server/src/modules/payroll/controller.js) |
| PAY-004 | Explicit advance deduction is capped at outstanding balance, but can exceed gross salary; net is clamped to zero. The gross-recovery cap remains an unanswered business rule. | [controller.js](../../../server/src/modules/payroll/controller.js) |

No tests were skipped or marked expected-failure to hide these policies. See [decisions](../../repository/decisions.md) before implementing them. Source-review gaps and unexecuted complex scenarios remain explicit in that document and coverage.csv.

Server/client unit results and the unchanged server coverage gate are separate from these Playwright results; see [validation](validation.json). Regenerate this analysis after a completed audit with python3 scripts/analyze-playwright-failures.py.
