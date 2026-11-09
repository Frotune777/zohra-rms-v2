# Playwright audit — phase 2

The completed audit on 9 November 2026 ran **466 tests: 466 passed, 0 failed**, with no skips or timeouts. POS now opens on dining tables 1–12, carries the selected table into checkout, and accepts optional phone numbers for every payment mode. Authenticated table/type drafts, real account switching, legacy/lost-response retries, phone-free receivable settlement, table management and mobile checkout have direct browser/API/database assertions. The full run retains the earlier accounting, payroll, inventory, import and screen regressions. See [POS evidence](pos-tables/README.md), [results](results.json) and [repair verification](repair-verification.md).

All **174 checklist IDs** have passing subcases; **every ID remains partial**. [Coverage](coverage.csv) lists remaining browser, role, date, rounding, concurrency and correction scenarios. A passing suite establishes its executed assertions.

Server assertions pass **590/590** across 26 suites; client assertions pass **80/80**. Default Babel Jest passes all four unchanged 70% requirements: statements 82.01%, branches 74.67%, lines 82.93%, functions 78.35%. [POS verification](pos-tables/jest-verification.json) and the earlier [Jest expansion](jest-expansion/README.md) retain scenario ownership and observed failures. The separate same-run V8 unit/API/Playwright gate also passes; [combined summary](server-combined-coverage/summary.json) records its metrics and source hashes. [Validation](validation.json) keeps providers and dated dependency/container evidence distinct.

[Current dependency evidence](remaining-dependencies.json) reports no outdated direct registry packages or installed Python packages. Vite React plugin 6.3.0 is verified. Root/client advisories are 0; server retains 5 low development-chain findings with an installed, checksum-verified and security-tested deepmerge mitigation. Actual versions and advisories remain visible while awaiting a fixed upstream release.

Historical evidence is preserved: [original baseline](baseline-before-fixes/results.json), [359/362 pre-completion checkpoint](before-feature-completion/results.json), [421/421 prior checkpoint](before-remaining/results.json), [first remaining-feature run](remaining-full-first/results.json), [interrupted authorization run](remaining-interrupted-authorization/results.json), and [436/439 pre-notes-fix run](remaining-full-before-vendor-notes-fix/results.json). The latter had two fixture failures and one vendor notes defect. [Focused follow-up](fixes/remaining-failure-followup/results.json) passes all three without changing timeouts or retry counts. The setup failures have no established root cause; resource contention is only a hypothesis. [Failure analysis](failure-analysis.md) and [failed-test CSV](failed-tests.csv) describe the current completed run. The [before-Jest checkpoint](before-jest-expansion/scope.md), [437/439 first post-expansion run](jest-expansion/playwright-first/results.json) and [two-case follow-up](jest-expansion/playwright-followup/results.json) retain the earlier results. The two browser failures asserted old HTTP statuses; corrected 500/400 expectations and unchanged rollback checks pass the final full audit.

## Reproduction and isolation

Root test:audit and test:e2e use [playwright.audit.config.cjs](../../../playwright.audit.config.cjs). Chromium runs with one worker and no retries. Each case starts a fresh real API on port 33130 and clones a checksum-verified template database; Vite uses 33129. Owner, manager and staff have separate bcrypt passwords and employee identities. The default business instant is 9 November 2026; boundary cases override it explicitly.

[Database guard](../../../tests/audit/database.cjs) requires user zohra_audit, host 127.0.0.1, port 55439, no password, names zohra_pw_*, and actual cluster directory /private/tmp/zohra-audit-pg. Only guarded setup/teardown uses the administration database. No business database was accessed or migrated. Avoid concurrent audits on the fixed ports and simultaneous Docker builds during coverage collection.

With Node 26.13.0 selected:

~~~sh
npm ci
npm --prefix client ci
npm --prefix server ci
uv sync --locked
npx playwright install chromium
npm run test:audit
npm run test:coverage  # same-run server unit + real API/browser coverage
npm run test:docker    # isolated PostgreSQL 15 containers
python3 scripts/summarize-playwright-audit.py
python3 scripts/analyze-playwright-failures.py
npx playwright show-report playwright-report/audit
~~~

The local run used Chromium at /private/tmp/zohra-playwright-browsers and Node at /private/tmp/zohra-node/node_modules/node/bin. This workspace needs scoped loopback/browser execution permission. Full audit uses PostgreSQL 14.20; [Docker evidence](container-verification.json) separately verifies fresh PostgreSQL 15.19 initialization and API/Chromium refund smoke. Initialize the disposable cluster once with initdb -D /private/tmp/zohra-audit-pg -U zohra_audit -A trust and keep pg_ctl on PATH; setup supplies loopback binding.

Filtered runs overwrite results.json/bootstrap.json. Preserve completed evidence first and label filtered scope. [Test manifest](test-manifest.json) records execution-time test/harness hashes; [analysis validation](analysis-validation.json) checks final-source consistency. Local traces/screenshots/HTML/API logs are under test-results/audit and playwright-report/audit.

## Schema and operational limits

[Bootstrap](bootstrap.json) records two canonical SQL files and repeat history checks. [Canonical contracts](../../repository/corrections-and-valuation.md) describe checksum authority, source-linked corrections, stock-value precision and exact synthetic legacy adoption. CLI, Docker and audit share the canonical engine; seeds are separate. Fresh initialization and exact recorded legacy upgrade regressions pass. Custom/business-data upgrades, production deployment, historical opening reconciliation, unresolved attendance/owner/leave policies and wider scenario coverage remain separate.

The sample-data application is available at **http://localhost:3002**, API **http://127.0.0.1:5001**. [Manual testing](../../repository/manual-testing.md) documents credentials and safe restart; [startup evidence](manual-startup-verification.json) records all three real browser/API logins. It uses normal application time and preserves the existing sample database.

The [before-POS checkpoint](before-pos-tables/scope.md) preserves the completed 439/439 browser and 556/556 Jest evidence. [First full POS run](pos-tables/full-first/scope.md) retained 463/465 passes and the two legacy draft failures; [27-case focused follow-up](pos-tables/final-focused/results.json) verified authenticated draft ownership and legacy retry corrections before the final full run.
