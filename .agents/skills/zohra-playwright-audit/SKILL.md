---
name: zohra-playwright-audit
description: Run, extend or interpret Zohra RMS v2's guarded Playwright audit across browser, real API, disposable PostgreSQL and synthetic import data. Use for feature verification, audit evidence or regression reproduction, rather than ordinary unit-test or UI-only work.
---

# Zohra Playwright audit

Read [the phase 2 reproduction and limits](../../../docs/audit/phase2/README.md) and the relevant [feature routing](../../../docs/repository/feature-routing.md). The active config is [playwright.audit.config.cjs](../../../playwright.audit.config.cjs); default historical root/client configs forward to it.

For failed-test interpretation, read [failure analysis](../../../docs/audit/phase2/failure-analysis.md) and [the exact failed-test list](../../../docs/audit/phase2/failed-tests.csv). They distinguish shared/cascade causes, incorrect rejection statuses and historical policy expectations; current rules are recorded in decisions.md. For an interactive application session, follow [manual testing](../../../docs/repository/manual-testing.md); that session is separate from the per-case automated audit and uses normal application time.

## Isolation

Use [database.cjs](../../../tests/audit/database.cjs) and [fixtures.cjs](../../../tests/audit/fixtures.cjs). Their guard requires user `zohra_audit`, host `127.0.0.1`, port `55439`, no connection password, and `zohra_pw_*` database names. Only guarded setup/teardown may use the audit cluster's `postgres` administration database. Setup verifies the actual data directory is `/private/tmp/zohra-audit-pg`.

The harness clones a checksum-verified template for every test, starts a fresh API on `33130`, serves Vite on `33129`, and uses one worker with no retries. Preserve that isolation when extending it. Owner, manager and staff have separate real accounts and employee identities. The default business instant is 9 November 2026; use the fixture's `businessInstant` option for explicit boundary cases.

The audit shares the [canonical migration engine](../../../server/scripts/migration-engine.js) with CLI and Docker; sample records are seeded separately. Full audit uses PostgreSQL14; [container evidence](../../../docs/audit/phase2/container-verification.json) covers a separate PostgreSQL15 startup/refund smoke. Do not run legacy initialization or implicit business credentials. Custom/business-data upgrades remain separate from exact synthetic legacy adoption.

## Execute and retain evidence

Run from the repository root with the lockfile dependencies and Chromium installed as documented in phase 2:

```sh
uv sync --locked  # installs the pypdf audit parser into .venv
npm run test:audit
python3 scripts/summarize-playwright-audit.py
npx playwright show-report playwright-report/audit
```

A focused reproduction can use `npm run test:audit -- --grep 'BILL-001'`. The reporter still overwrites `docs/audit/phase2/results.json`, and setup rewrites `bootstrap.json`; preserve the prior complete-run evidence and label the filtered run's scope before using this command. Avoid concurrent runs on the fixed ports. Run the summarizer after the corresponding run completes.

## Extend and assess

For real server coverage, `npm run test:coverage` combines same-run V8 unit/API/Playwright evidence under the unchanged 70% thresholds. Standalone unit coverage has its own result; do not hide that threshold exit or reuse stale runtime files.

Keep the original checklist IDs in relevant test titles; read [coverage.csv](../../../docs/audit/phase2/coverage.csv) for their outstanding scope. Extend tests in [tests/audit](../../../tests/audit) using the existing fixtures, evidence recorder and [journal/snapshot helpers](../../../tests/audit/helpers.cjs).

For successful data changes, assert the UI behavior where exercised, exact API outcome, and persisted source-linked state. Check each journal's accounts, amounts and source reference independently; a globally balanced ledger can hide wrong postings. For rejected multi-write operations, compare all affected state before and after. Controlled barriers exist for selected races; simultaneous submissions alone do not prove every race boundary.

Preserve reproduced failures and distinguish setup failure, response-status defects and persisted corruption. Do not weaken assertions or suppress cases to manufacture a passing report. A failed early assertion leaves later checks unexecuted. Passing subcases retain partial checklist coverage; counts and claims must match completed result artifacts. Initial accessibility names and document-width checks do not certify full keyboard or responsive workflows.

Audit authorization does not itself authorize business-logic fixes. Use [decisions](../../../docs/repository/decisions.md) to identify unresolved policies before treating provisional checks as product requirements.
