# Current failed-test analysis

Completed run: 421 tests; 420 passed; 1 failed or timed out. Exact evidence: [results](results.json), [failed tests](failed-tests.csv), and [coverage](coverage.csv).

The original 355-test run (161 passed / 194 failed) and its diagnoses remain in [baseline-before-fixes](baseline-before-fixes/failure-analysis.md). Current technical repairs and verification limits are documented in [repair verification](repair-verification.md).

| Test | Reached failure and decision needed | Source |
| --- | --- | --- |
| POS-006 | Requires review of this exact reached assertion and persisted evidence; no automatic root-cause claim. |  |

No tests were skipped or marked expected-failure to hide issues. See [decisions](../../repository/decisions.md) for confirmed rules and remaining policy questions. Source-review gaps and unexecuted complex scenarios remain explicit in that document and coverage.csv.

Server/client unit results and the unchanged server coverage gate are separate from these Playwright results; see [validation](validation.json). Regenerate this analysis after a completed audit with python3 scripts/analyze-playwright-failures.py.
