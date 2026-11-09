# Repository audit — 9 November 2026

This document preserves the phase 1 analysis and dependency baseline. Continue with the [phase 2 Playwright results](phase2/README.md) for the later schema prerequisites, Psycopg 3 compatibility repair, executable feature checks and remaining coverage. Statements below about pending Playwright work and unchanged SQL describe the phase 1 checkpoint; they are not the current phase 2 status.

The repository is **not ready to be described as fully verified or production ready**. This audit records current source, fresh-database failures, executable checks, and a separate list of work that still requires the full Playwright feature audit. Historical documents and saved test reports are not proof that the current implementation works.

## Scope and evidence

- The tracked-file inventory covers 444 files, including application code, SQL, tests, configuration, scripts, documentation, and the supplied data files. Binary/data files are inventoried; their contents are not assumed correct.
- There are 15 backend feature modules, 142 route registrations, 77 GET registrations, 32 explicitly routed client screens, and one client fallback. The chicken namespace aliases inventory routes. Counts describe declarations, not passing features.
- [repository-inventory.json](repository-inventory.json) contains file hashes, line counts, route registrations, client API call expressions, local-import findings, and SQL table declarations. Its regex extraction is an index for review, not a substitute for an AST or browser testing.
- [schema-results.json](schema-results.json) records the SQL execution results. [runtime-results.json](runtime-results.json) records 308 real HTTP probes across anonymous, staff, manager, and owner JWT roles, plus targeted reproductions. Synthetic role tokens test the guards; they do not verify separate real accounts.
- [verification-results.json](verification-results.json) records baseline and upgraded test results, failure names, Python checks, and build evidence. [syntax-results.json](syntax-results.json), [sheetjs-smoke.json](sheetjs-smoke.json), and [upgrade-smoke.json](upgrade-smoke.json) retain the syntax, workbook, and browser checks. [dependency-baseline.json](dependency-baseline.json) and [dependency-final.json](dependency-final.json) record dependency versions and registry results.
- [feature-map.md](feature-map.md) maps every routed screen. [playwright-scenarios.csv](playwright-scenarios.csv) contains the original 166 bundled scenarios covering all 32 screens and complex domain interactions. Current executed subcases and explicit remaining scopes are in [phase2/coverage.csv](phase2/coverage.csv).

The real application database was not accessed. SQL and API checks used a disposable PostgreSQL 14.20 cluster at port 55439. Docker specifies PostgreSQL 15; its daemon was stopped, so actual container execution and PostgreSQL 15 behavior remain unverified. A best-effort combination of SQL files was used only to diagnose additional failures; it is **not a valid migration procedure**. A successful GET on empty synthetic data does not prove financial totals, ownership controls, transitions, or concurrency.

## Architecture and feature boundaries

The client is a React single-page application with BrowserRouter, an AuthContext backed by a localStorage JWT, a shared Axios instance, shared hooks/forms, and Recharts reports. All page modules are imported eagerly. The backend is an Express modular monolith with PostgreSQL access through a shared pool, JWT and role/permission middleware, HTTP security middleware, Winston logs, and Socket.IO for kitchen events.

Finance has JournalEntry/LedgerLine entities and a central JournalService. Several legacy paths write directly to journal, ledger, transaction, or vendor tables. Payroll and advance handling have multiple implementations: employee services, the standalone payroll controller, and the advance-request controller. Attendance has two services and two API namespaces. These paths must be audited separately because their rules and persistence differ.

| Area | Current implementation | Required verification focus |
| --- | --- | --- |
| Authentication | Login, registration, current user, user list, JWT guards | Password changes, inactive users, role escalation, expiry, direct page access |
| POS/menu | Menu list/add/delete, cart, orders, recipe deductions, payment transactions | Trusted prices, payment mode contract, stock limits, retry/idempotency, receipt/KOT behavior |
| Inventory/chicken | Stock CRUD/movements, rates, markup rules, bills, supplier ledger, purchase orders | Commit/rollback, approval/rejection, zero values, threshold boundaries, duplicate receiving, costing |
| Employees | CRUD, history, status and salary fields | Concurrent codes, zero salary edits, history consistency, dependent-record deletion |
| Attendance/leaves | Bulk/calendar attendance, leave requests and approvals | Half-days, date ranges, existing attendance, paid/unpaid leave policy, user ownership |
| Advances | Requests, approvals, repayment schedules, advance ledger | Distinct API contracts, approval permissions, FIFO/partial recovery, over-repayment and races |
| Payroll | Draft, approval, payout, revert/delete; separate legacy payroll service | Zero days, leap years, missing attendance, components, deductions, reruns, accounting reversal |
| Finance | Revenue/expenses, tracker, journals, payments, mappings, reconciliation, closure, wallets | Atomic posting, account routing, edits/reversals, closed periods, float/cash conservation |
| Vendors | Outstanding balances, payments, ledger, aging/category analytics | Per-vendor accounts, concurrent payment limits, historical balances, aging after partial settlement |
| Reports/dashboard | Financial, HR, operations and inventory aggregates | Authentication, fixture-based totals, reversal effects, case consistency, date boundaries |
| Forecasts | Weighted moving average and suggested purchase quantities | Sparse history/zero days, completed tickets, units, fixed lead-time assumptions |
| Configuration | Option CRUD/toggle/reorder/import | Role permissions, inactive options, partial updates, category scoping and rollback |
| Kitchen/recipes/POs | Backend support; no complete dedicated routed workflow | API and socket checks alongside the UI; do not invent nonexistent UI routes |

## Verified high-priority findings

**F01 — Authentication bypass and inactive accounts (critical, reproduced).** `server/src/modules/auth/controller.js` accepts the known demo password for each default email after bcrypt comparison fails, with no production-only restriction. It also does not check user status. An inactive synthetic owner with a different bcrypt hash received HTTP 200 and a JWT using `owner123`. Changing the stored password does not disable this fallback.

**F02 — Reports require no authentication (critical, reproduced).** `server/src/modules/reports/routes.js` has no JWT or role middleware. All 12 report routes returned HTTP 200 without Authorization in the audit database, including financial and HR reports.

**F03 — Staff can change system configuration (high, reproduced).** Config routes use only `verifyToken`. A staff JWT successfully created a configuration option with HTTP 201. Employee advance read routes and the auth user-list route also lack the role restrictions applied to related writes; ownership rules must be checked with separate employee fixtures.

**F04 — Approval permissions are undefined (high, reproduced).** Leave and standalone advance approval routes require `PERMISSIONS.HR_WRITE`, which does not exist. Manager leave approval returned HTTP 403 before database access. `PERMISSIONS.ADMIN` is also referenced but undefined; the owner bypass makes reopening behave differently from explicit permission evaluation. The older RBAC file uses `view/create/edit` permissions and cashier/kitchen roles, while active auth configuration uses `read/write` and owner/manager/staff.

**F05 — Fresh SQL initialization fails (critical, reproduced on PostgreSQL 14.20).** The top-level SQL sequence used by the Docker init mount stops at its 15th file, `database/10_finance_schema.sql`: its index uses `journal_entries(date)`, while the existing table has `transaction_date`. A diagnostic pass attempted 56 SQL files and recorded 11 failures, including ordering conflicts, missing accounts/tables/columns, duplicate definitions, and incompatible view replacement. Nested migrations are not automatically executed by the top-level PostgreSQL init mount. No migration history/checksum mechanism exists.

**F06 — Bill creation does not commit (critical, reproduced).** `InventoryService.createBillEntry` begins a transaction, returns its result, and releases the client without COMMIT on success. The audit returned a bill ID while a separate connection saw zero rows for that ID. Releasing a pooled connection with an open transaction can also affect later requests.

**F07 — Tracker accounting bypasses the central engine (critical, source verified; complex scenarios pending).** `TransactionService.createTransaction` writes the business transaction, journal header/lines and vendor records through separate pool queries. It catches journal errors and returns the transaction. It maps cash/bank activity to account 1100, seeded as employee advances, and pending vendor expenses to account 5000, seeded as COGS. Edits and deletes do not update/reverse the original journal. The architecture's single-source and atomic-posting claims are therefore not implemented on this path.

**F08 — Payroll reversal changes descriptions, not balances (critical, source verified).** Standalone payroll revert/delete code appends reversal text to journal descriptions instead of posting reversing ledger entries. Its match uses all `Payroll Payout - %` journals on the payment date rather than a specific payroll source ID. Advance recovery is adjusted through separate ledger entries without restoring matching salary-advance recovery records. Multi-employee, repay-and-revert scenarios are mandatory.

**F09 — POS contracts and trust boundaries differ (high, source verified).** The client sends `paymentMode`; `PosService` reads `paymentMethod` and defaults to Cash. It uses the submitted item price rather than the fetched menu price. POS and wastage subtract stock without an insufficient-stock guard and bypass `stock_movements` on some paths. Discount/notes/order-type fields do not have a complete matching persistence path. These are not described as passing business scenarios.

**F10 — Payroll/advance implementations disagree (high, source/schema verified).** The legacy PayrollService treats `daysWorked = 0` as a full month through `daysWorked || daysInMonth` and creates a cash journal during generation. The standalone payroll path drafts then pays, performs advance recovery, and uses account 6100. The schema scripts drop `salary_advances.is_recovered`, while payout queries still use it. The standalone request controller expects schedule/audit tables and fields absent from the diagnostic schema. The GET repayment-schedule request reproduced a missing-table HTTP 500.

**F11 — Procurement transitions are incomplete (high, source verified).** Bill creation adjusts matching stock before approval; approval writes a vendor ledger bill without a purchase journal; returning an approved bill to Pending/Rejected physically deletes its ledger entry. Rejection does not reverse stock. PO receiving directly updates stock and vendor ledger without movement/journal posting, and the status logic allows Received → another status → Received to receive again. These violate documented traceability and immutability rules.

**F12 — Vendor/wallet balances need concurrency checks (high, source verified).** VendorPaymentService reads outstanding without locking the vendor balance and posts to global payable account 2000 rather than the supplier's generated account. Account codes and employee codes use MAX-plus-one patterns without a concurrency guard. Transfers do not check available wallet/source funds. Two simultaneous requests need distinct connection tests.

**F13 — CORS and kitchen sockets are permissive (high; HTTP reproduced, sockets source verified).** An unlisted origin received its own Access-Control-Allow-Origin value with credentials enabled. The fallback explicitly allows every origin. Socket.IO allows `*` and joins the kitchen room without authenticating the connection. Full socket event authorization/delivery is still pending.

**F14 — Journal entities accept invalid numeric/date values (high, reproduced).** JournalEntry/LedgerLine accepted an invalid numeric string, Infinity, and an invalid date. `parseFloat` and comparisons do not reject NaN/Infinity; an invalid Date is not checked. The balance tolerance also permits some sub-cent differences before database rounding. Database persistence of those inputs is not assumed successful.

**F15 — Report math is not consistently reversal-aware (high, source verified).** Several revenue/expense aggregates sum credit-only or debit-only values, so reversing lines need independent totals. Advance KPI/summary queries use lowercase `advance`/`recovery` while active services insert `Advance`/`Repayment`; some queries normalize case and others do not. The balance-sheet date joins, historical vendor balances, rounding, and half-day attendance denominators require exact fixture assertions.

## Other confirmed gaps

- ProtectedRoute supports `requiredRoles`, but App.jsx does not supply it to the individual screens. Hidden navigation links do not enforce direct page access. The API guard and page guard must both be audited.
- POS KOT/KOT & PRINT buttons have no handlers. SAVE & PRINT changes the success message without printing. Table/customer controls are placeholders. Menu CRUD has no edit endpoint/UI despite README claims.
- PDF export is a placeholder that calls `toast.info`, not an implemented PDF download. CSV export only escapes strings containing commas/quotes, leaving newline-only fields, spreadsheet formulas and URL cleanup to verify/fix.
- Config lookup filters inactive options, while ConfigManager offers activation management; inactive visibility and partial updates need testing. ID-based updates/deletes do not consistently constrain the route category.
- AI uses a deterministic weighted average, not an external model. Missing days are skipped, units are generic, and lead time is fixed at two days. There is no trained-model quality/evaluation evidence.
- Five unresolved local import expressions were found in reference/debug scripts. `server/scripts/migrate.js` references missing `database/schema.sql`; `db:seed` references missing `scripts/seed.js`. These commands are not operational migrations.
- AST parsing checked 223 tracked JS/JSX/TS files and found an unexpected token at 56:36 in unused `client/src/pages/BATCH_UPDATE_REFERENCE.js`. The application build passes because this reference file is not part of its import graph.
- Setup writes a client API URL without `/api`, accepts Node 16, and searches nonexistent schema paths. README, Compose, environment templates and Playwright disagree on ports. `start.sh` force-kills processes on application ports; it was not executed. `db-access.sh users` selects `name` instead of `full_name`.
- Client/container production deployment is still a root-run Vite development server. The production bundle is 1,075.61 kB before gzip and produces the oversized-chunk warning; route code splitting is absent.
- SQL parameter logging can include sensitive values. Auth error responses expose stack/details directly, bypassing production sanitization in the global error handler. Missing `server/src/logs` produces a database log-stream error.
- The repository has CODEOWNERS but no tracked CI workflows to enforce its checks. Multiple historical reports and a tracked `.setup_complete` marker do not establish current readiness.
- The migration importer catches some failed stages, continues, and can mark every employee inactive if attendance mapping yields no IDs. Source workbooks/imports were checked; a full legacy-data migration and reconciliation were not executed.

## Dependency upgrade and compatibility

Current registry results, rather than the old version ranges, were used. All direct npm dependencies now match their registry `latest` version, except SheetJS, whose supported release comes from its official CDN rather than the stale npm package. `npm outdated --json` returned `{}` for root, client and server. The exact versions and resolved integrity metadata are retained in three npm lockfiles.

| Component | Upgraded version | Verification |
| --- | --- | --- |
| Node | 26.13.0 | Installed in /private/tmp; `.nvmrc` added; commands run with this runtime |
| React / React DOM | 19.3.1 | Client build and existing tests executed |
| React Router | 7.18.5 | Obsolete v6 future flags removed; browser smoke recorded separately |
| Vite / React plugin | 8.3.6 / 6.2.1 | Production build succeeds |
| Tailwind / PostCSS adapter | 4.3.5 / 4.3.5 | CSS import/config/custom utility migrated; build and browser background check pass |
| Vitest / jsdom | 5.1.0 / 31.0.0 | Existing 50 client tests executed; unit test discovery excludes Playwright |
| Express / bcryptjs / dotenv | 5.3.0 / 3.0.3 / 18.0.9 | Existing backend tests and actual route probes executed |
| Playwright | 1.65.0 | 25 existing root tests and one separate client test discoverable; dependency smoke passes; full feature audit pending |
| SheetJS | 0.20.3 | [Official installation source](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/); all four supplied XLS/XLSX workbooks read successfully |
| Python | pandas 3.1.1; other exact pins in pyproject.toml | uv.lock regenerated; importer imports and all four workbook metadata reads pass |

Other direct libraries were also brought to their latest versions; the complete mapping is in dependency-final.json. Added missing Nodemon and Python SQLAlchemy/PostgreSQL/Excel/dotenv requirements. Docker uses `npm ci` and the pinned Node image; the exact `node:26.13.0-alpine` image manifest was verified. Image builds and application container execution remain untested. PostgreSQL data/image upgrades were not performed; these require a separate migration and container verification.

The removed Simple Icons Microsoft Excel export was replaced with the existing file-text icon. The shared custom CSS panel was registered as a Tailwind 4 utility. Removed the explicit relative PostCSS search path from Vite: browser verification found that it prevented stylesheet processing when Vite was started from the repository root, and automatic config discovery fixed that case. The Vitest matcher setup now imports its Vitest-specific entry. npm lockfiles are no longer ignored. No application authentication/accounting fixes were bundled into the dependency changes.

## Check results and remaining limits

| Check | Baseline | Upgraded/current |
| --- | --- | --- |
| Client production build | Passed | Passed, oversized-chunk warning remains |
| Backend tests | 146 passed, 37 failed / 183 | Same failure set after upgrade and patched glob/minimatch |
| Backend coverage | Below required 70% | Statements 53.54%, branches 36.75%, functions 50.31%, lines 53.99% |
| Client tests | 41 passed, 9 failed / 50 | 46 passed, 4 failed; remaining failure names are a subset after normalizing reporter whitespace |
| Root npm audit | Not captured before upgrade | 0 advisories |
| Client npm audit | 7 advisories, including 2 critical | 0 advisories |
| Server npm audit | 20 advisories | 5 low findings from one remaining deepmerge advisory propagated through Jest |
| Server production npm audit | Not captured before upgrade | 0 advisories |
| npm dependency trees | No baseline claim | Root/client/server peer-tree verification recorded in verification-results.json |
| Python imports/workbooks | Manifest lacked required importer dependencies | Passed on Python 3.14.2; no full ETL execution |
| Python Ruff / mypy | No baseline run | 23 Ruff findings and 3 mypy errors in existing Python sources |
| Compose / shell syntax | No baseline run | Compose config and all 7 tracked shell scripts parse |
| JavaScript/JSX/TypeScript syntax | No baseline run | 223 tracked files checked; one unused reference file fails parsing |
| Fresh SQL initialization | Reproduced during audit | Fails; no application schema fixes applied |
| Browser dependency smoke | No baseline screenshot | Passed: login, POS render, Tailwind background, direct reloads of dashboard/employees/reports, no uncaught page errors; full workflows pending |

The remaining deepmerge advisory affects its latest npm release, 4.3.1. npm suggests downgrading Jest to 25.1.0, which conflicts with the requested latest dependency upgrade. Patched glob 14.0.4 and minimatch 11.0.5 overrides remove the moderate test-tool advisories, with the existing backend test results unchanged. There is no claim that the complete development graph is vulnerability-free.

The four remaining client failures concern the old `/orders` mock assertion and the vendor-payment fixture/render setup. Backend failures include stale mock sequencing, incomplete account fixtures, contract/error-status differences and real gaps. The tests were not weakened, skipped, or rewritten to manufacture a green baseline. Detailed failed names/messages remain in verification-results.json.

## Next Playwright audit

Start by establishing one repeatable fresh schema and an isolated test database, then repair the existing test harness. Root Playwright discovery finds 25 tests in nine files; the separate client configuration discovers one test in one file. These suites do not cover every feature. Current tests assume nonexistent routes such as `/closure`, `/hr/employees`, `/inventory/adjust` and `/inventory/wastage`, use shared mutable data, and have empty setup hooks. A test titled orphan-journal detection does not actually query orphan entries; global balance can pass on an empty ledger or when incorrect entries offset one another.

Use the scenario CSV as the checklist, expanding cases when new behavior is discovered. Every passing workflow needs a UI assertion, an exact API result, and source-linked database assertions where it changes business data. Verify each journal independently, minimum line count and source reference, relevant account balances, stock/movement pairs, employee/vendor ownership and audit attribution. Rejected operations must leave all affected rows and balances unchanged.

Run each role with a separate account/employee, freeze business dates explicitly, and use separate browser contexts/database connections for races. Require fresh fixtures, deterministic cleanup, explicit test URLs, traces/screenshots on failures, no broad success-or-error assertions, no swallowed setup failures, and no silent skipped cases. Cover Chromium first, then mobile and other browsers once the behavior is stable. Complete financial round trips (purchase → approve → pay → close → reopen/reverse) and HR round trips (attendance/leave → advance → payroll → payout → reversal) are mandatory.

## Reproduction commands

With Node 26.13.0 selected, install from the root, client and server lockfiles using `npm ci` in each directory. Run `npm run build`, `npm run test:client`, and `npm run test:server -- --runInBand --coverage` from the repository root. `npm run test:e2e -- --list --reporter=list` discovers the current root suite without overwriting historical HTML reports. Full Playwright execution needs an isolated, initialized database and running client/API.

`npm run audit:inventory` recreates the tracked-file index. `scripts/audit-schema.cjs`, `scripts/audit-runtime.cjs`, and `scripts/smoke-upgrade.cjs` require the explicitly isolated audit PostgreSQL cluster and local socket/browser permissions. Schema audits create fresh timestamped databases; runtime/smoke read the selected diagnostic database from schema-results.json. The diagnostic cluster is not an application database or a deployment-ready schema.
