# Server Jest testing

Jest now includes domain unit tests, existing mocked controller/service tests, and real PostgreSQL/Express integration suites. The integration tests establish persisted behavior; a mocked SQL result alone does not establish a successful database workflow. Current counts and coverage belong to [Jest evidence](../audit/phase2/pos-tables/jest-verification.json); [Jest expansion](../audit/phase2/jest-expansion/verification.json) retains the preceding checkpoint.

Run from the repository root with the Node version in .nvmrc and installed lockfile dependencies:

```sh
npm run test:server -- --runInBand --coverage
npm run test:server -- --runInBand --runTestsByPath tests/shortfalls.integration.test.js
```

Focused paths are relative to server/, because the root npm script forwards to that package. The default coverage provider is Babel. All four global thresholds remain 70%; db.js and socket.js retain their original exclusions. The separate V8 unit/API/Playwright gate reports a different measurement and cannot substitute for standalone Jest coverage.

## Isolation and assertions

[Integration helper](../../server/tests/helpers/integration.js) verifies the guarded PostgreSQL cluster at /private/tmp/zohra-audit-pg, user zohra_audit, loopback host and port 55439. Each suite creates a unique zohra_pw_jest_* database, bootstraps canonical migrations, and closes its pools and drops that database afterward. Each case resets business and lookup tables, restores canonical lookup defaults and seeds synthetic identities, stock, recipes and suppliers. Migration histories are preserved. Tests never select a business database or reuse the manual demo database. PostgreSQL must be running; setup failures are failures, not skipped tests.

Supertest uses the real Express app, auth middleware and application pool on ephemeral listener ports. The integration suites need local listener/database execution permission in a restricted workspace. They do not use the fixed Playwright ports, but use --runInBand to keep the test environment straightforward to diagnose.

For successful financial writes, expect exact source-linked account/debit/credit rows, recorded actor and amount, and affected cash/debt/stock state. Expected journal values are supplied independently of the implementation. Global ledger balance alone can hide incorrect accounts or amounts. Retry tests compare snapshots and original identities to detect duplicate sources or history.

Rejected multi-write operations compare all public table rows before/after, excluding migration history. PostgreSQL sequences may advance after rollback; row identity gaps are permitted. AFTER triggers force errors at later database stages so rollback assertions verify earlier writes were actually attempted. Selective dependency failures are used for read/service error boundaries; successful integration workflows use actual queries.

The tracker competing-writer tests and shortfall collection test hold PostgreSQL row locks and inspect pg_stat_activity before releasing the barrier. They have explicit deadlines and do not depend on arbitrary sleeps. Other simultaneous-submission cases establish the tested outcomes only. The schedule boundary helper overrides Date for one awaited operation and restores it in finally; SQL CURRENT_DATE remains database time.

## Scenario ownership

| Suite | Verified scenario families |
| --- | --- |
| [domain-contracts](../../server/tests/domain-contracts.test.js) | Finite amount validation/status mapping; journal date/account/distinct-line/balance errors; rounded cents; carrying value and final depletion |
| [transfer](../../server/tests/transfer.integration.test.js) | Cash/Bank/UPI funding, wallet overdraft/history, owner classification, employee debt/FIFO, invalid targets/accounts/amounts, locks and rollback |
| [tracker](../../server/tests/tracker.integration.test.js) | Sales/expense/asset transfer, vendor liability/settlement, filters/totals, metadata and numeric retry, exact reversal/history, calendar day, candidate-to-lock races and caller rollback |
| [procurement-config](../../server/tests/procurement-config.integration.test.js) | PO state transitions, weighted/free receipt, duplicates/precision/FK errors, receipt rollback; config CRUD/category identity, import/upsert/reorder validation, later-row rollback and permissions |
| [hr-lifecycle](../../server/tests/hr-lifecycle.integration.test.js) | Leave ownership/types/approval audit and Paid earnings; scheduled loan month-end/leap/cents, recovery/reversal; payroll components/reruns/zero/negative pay, shortfall correction and late failures |
| [vendors-ledger](../../server/tests/vendors-ledger.integration.test.js) | Opening/prior-window/running balances, category opening conservation, aging boundaries and FIFO, mode/filter totals, payment references/debt/actor and rollback |
| [stock-refunds](../../server/tests/stock-refunds.integration.test.js) | Recipe replacement/clear/rollback; positive/negative/depletion adjustments; exact wastage/adjustment reversals after receipts; Cash/Due/Part refund, preparation restrictions, reconciliation failures and late rollback |
| [shortfalls](../../server/tests/shortfalls.integration.test.js) | Receipts and reversals, final cent, amount/reference/owner/source conflicts, competing over-collection, invalid input, financial periods and stage-specific rollback |
| [journals-closures](../../server/tests/journals-closures.integration.test.js) | Domain/raw journals, cutoff/account signs, caller/owned transactions, exact reversal/retry, PnL/filter behavior, active payment modes/reference rules, variance and account-specific closure/reopen rollback |

Passing these scenarios does not prove every conceivable happy or unhappy path. Consult [Playwright remaining scope](../audit/phase2/coverage.csv) for browser and feature obligations. Historical/custom migrations, full socket delivery/reconnect behavior, unresolved leave entitlement/attendance/owner policies, and arbitrary interleavings remain outside these Jest claims. Extend tests when a new behavior or reproduced failure requires evidence; avoid assertions that merely repeat SQL construction or assert only HTTP success.

The [POS table integration suite](../../server/tests/pos-tables.integration.test.js) checks table read permissions/defaults/configuration, optional phone across Cash/Card/Due/Part, exact receivable/payment/COGS/stock/ticket state, name-only customer identity, settlement and checkout retries, malformed optional text rollback and late kitchen failure. [POS reference](pos.md) maps companion client and browser assertions.
