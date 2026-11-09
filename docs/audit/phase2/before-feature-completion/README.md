# Playwright audit — phase 2

The completed post-repair audit on 9 November 2026 ran **362 tests: 359 passed and 3 failed**, with no skips or timeouts. The original run had 355 tests: 161 passed and 194 failed. All 191 originally failing technical checks now pass; seven added integrity regressions also pass. The three remaining assertions depend on unanswered business rules: paid leave salary, wallet overdrafts, and explicit recovery above gross salary.

Exact outcomes are in [results.json](results.json), [failure analysis](failure-analysis.md), [failed tests](failed-tests.csv), and [validation](validation.json). [Repair verification](repair-verification.md) explains the implementation changes, corrected test fixtures and remaining limits. [The preserved baseline](baseline-before-fixes/failure-analysis.md) retains the original failures and diagnoses; named directories under fixes preserve earlier focused runs, including intermediate failures.

All 166 checklist IDs were attempted: 163 have passing subcases and 3 have failing subcases. **Every ID remains partial.** [coverage.csv](coverage.csv) lists unexecuted obligations. Passing initial screen checks does not establish complete browser CRUD, keyboard/modal behavior, every role, all financial writers or every concurrency boundary. Source-confirmed gaps in competing payroll writers, tracker correction snapshots, journal sub-cent rounding and legacy entrypoints remain in [accounting and HR](../../repository/accounting-and-hr.md) and [decisions](../../repository/decisions.md).

Server unit assertions pass **185/185** and client assertions pass **50/50**. The client production build passes with a chunk-size warning. The server's unchanged 70% global coverage requirement still fails; [validation](validation.json) records exact percentages. A successful test-assertion count does not make the coverage command successful.

## Reproduction and isolation

The root test:audit and test:e2e commands use [playwright.audit.config.cjs](../../../playwright.audit.config.cjs). Chromium runs with one worker and no retries. Each case starts a fresh real API on port 33130 and clones its database from a checksum-verified template; Vite uses 33129. Separate owner, manager and staff identities have bcrypt passwords and linked employees. The default business instant is 9 November 2026; boundary cases override it explicitly.

The [database guard](../../../tests/audit/database.cjs) requires user zohra_audit, host 127.0.0.1, port 55439, no password, database names zohra_pw_*, and actual cluster directory /private/tmp/zohra-audit-pg. Only its guarded setup/teardown uses the administration database. No business database was accessed or migrated. Avoid concurrent audits on the fixed ports.

With Node 26.13.0 selected and the dependencies installed:

~~~sh
npm ci
npm --prefix client ci
npm --prefix server ci
uv sync --locked
npx playwright install chromium
npm run test:audit
python3 scripts/summarize-playwright-audit.py
python3 scripts/analyze-playwright-failures.py
npx playwright show-report playwright-report/audit
~~~

The local run used Chromium at /private/tmp/zohra-playwright-browsers and Node at /private/tmp/zohra-node/node_modules/node/bin. This restricted workspace needs scoped loopback/browser execution permission. PostgreSQL 14.20 was exercised; PostgreSQL 15 and Docker remain unverified. Initialize the disposable cluster once with initdb -D /private/tmp/zohra-audit-pg -U zohra_audit -A trust and keep pg_ctl on PATH; setup supplies loopback binding.

Filtered runs also overwrite results.json/bootstrap.json. Preserve complete-run evidence before a focused rerun and identify its narrower scope. [test-manifest.json](test-manifest.json) records execution-time test/harness hashes; [analysis-validation.json](analysis-validation.json) checks them against the final test sources. These hashes do not certify application behavior. Local traces, screenshots, HTML report and API logs remain under test-results/audit and playwright-report/audit.

## Schema and operational limits

[bootstrap.json](bootstrap.json) records the selected migration sequence and repeat bootstrap. [042](../../../database/migrations/042_runtime_contract_prerequisites.sql) supplies runtime prerequisite fields and tables. [043](../../../database/migrations/043_audit_integrity_repairs.sql) adds text payer/actor fields, recovery allocations, preserved payment status, variance accounts and durable POS/import retry keys. See [data and migrations](../../repository/data-and-migrations.md) for exact declarations and exclusions.

The selected sequence is audit infrastructure, not a production migration plan. Conflicting SQL, the missing normal migration base schema/seed, Docker initialization, PostgreSQL 15 and upgrades of existing business data still require independent work. A successful disposable bootstrap is not deployment evidence.

The real sample-data application is separately available at **http://localhost:3002** with API on **http://127.0.0.1:5001**. [Manual testing](../../repository/manual-testing.md) documents current credentials and safe restart; [startup verification](manual-startup-verification.json) records fresh browser logins for all three roles. That demo uses normal application time and does not overwrite audit results.
