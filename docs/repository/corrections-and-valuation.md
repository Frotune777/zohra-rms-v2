# Corrections, stock value and canonical migrations

Exact executed results belong to [the current audit](../audit/phase2/results.json); passing subcases do not establish every checklist scenario. Regression sources are [corrections](../../tests/audit/corrections.spec.cjs) and [migrations](../../tests/audit/migrations.spec.cjs).

## Order refunds

[Refunds](../../server/src/modules/pos/refunds.js) exposes POST /orders/:id/refund, requiring FINANCE_WRITE, an actor-scoped Idempotency-Key, nonblank reason and boolean returnStock. It cancels the full order. One transaction locks order/kitchen ticket, reconciles completed payment amounts against paid_amount, records actor/reason/refunded cash/cancelled receivable in order_refunds, and reverses the original POS and collection journals by ID. Refunds use the original receipt accounts; revenue, tax and receivable reverse exactly. Original records remain available; payments become Refunded, order becomes Cancelled, and outstanding becomes zero. Cancelled orders reject collections.

Same-key/same-body retry returns the saved response; changed body or another refund returns 409. Current posting date and reversed accounts must be writable. Return-stock true requires a Pending ticket under lock, restores exact recorded sale quantities/values and reverses COGS. Preparing/Done orders reject that choice. False retains inventory deduction/COGS. Ticket becomes Cancelled and leaves the active display. These are full-order corrections; item-level partial refunds and correction of one receipt while retaining an order are separate contracts. Older sale rows without stock value refuse return pending reconciliation.

[Orders & Payments](../../client/src/pages/operations/OrderPayments.jsx) shows owner/manager actions and history. [CorrectionAction](../../client/src/pages/operations/CorrectionAction.jsx) retains retry key after failure and changes it when details change, asking for reason and unused-stock choice.

## Repayment and stock corrections

Manual approval stores exact FIFO allocations in advance_manual_allocations and source-journal installment allocations. POST /employees/payroll/requests/:id/reverse requires owner/manager and reason. [Repayment reversal](../../server/src/modules/employees/repaymentReversal.js) locks employee/request, verifies approved source and complete allocations, reverses its journal, restores exact modern advance/installment amounts, appends a compensating Advance ledger event and records actor/reason/source. Subsequent payroll recovery remains separate. Concurrent same-reason retries return the existing correction; another reason returns 409. Unreconciled historical repayments refuse correction. [Employee Balances](../../client/src/pages/operations/EmployeeBalances.jsx) shows action/history. Staff advance reads are limited to their linked employee.

POST /inventory/adjustments/:id/reverse and POST /wastage/:id/reverse require inventory/management access and reason. [Corrections](../../server/src/modules/inventory/corrections.js) preserve source, reverse its journal, record signed quantity/value and actor/reason, and restore exact original value after later average-cost changes. Reversing additions refuses quantity/value deficits atomically. One correction per source/item prevents double reversal; same-reason retries return existing history. [Stock screens](../../client/src/pages/operations/Workflows.jsx) expose these actions.

## Weighted average and reconciliation

[Valuation](../../server/src/modules/inventory/valuation.js) maintains four-decimal quantity and cent-accurate stock_value separately from displayed two-decimal unit_cost. Nullable legacy value initializes from rounded quantity × cost on the first recorded write, without a fabricated opening journal. Receipts add rounded posted value to existing carrying value. Consumption allocates value proportionally; complete depletion consumes every remaining cent. POS COGS, wastage, adjustments, ordinary cost edits, returns, PO receipts and approved bills use this value. [Reports](../../server/src/modules/reports/controller.js) read stock_value with a legacy fallback.

Pending bill creation posts no stock/debt/journal. Approval receives matching stock and posts supplier liability in one transaction. Approved rejection removes exact receipt quantity/value and reverses liability/journal; insufficient stock/value or settled debt blocks it. Unmatched names still create financial bills without stock; ambiguous names reject. PO receipt preserves prior value rather than repricing all stock. Free receipts may dilute average cost but create no fictitious debt. stock_receipts and inventory transaction values retain correction basis. Historical/imported/direct-SQL opening reconciliation remains necessary. No production data was migrated.

## Canonical schema authority

[Immutable baseline](../../database/canonical/001_baseline.sql) and [lookup defaults](../../database/canonical/002_lookup_seed.sql) replace competing Docker SQL initialization. Generated from verified legacy sequence through 047, baseline contains no employee/user/menu/stock/supplier business rows. Defaults supply required accounts/categories/payment modes/salary components/tax/config. [Manifest](../../database/canonical/manifest.json) pins checksums and strict canonical/legacy catalog fingerprints; [legacy manifest](../../database/canonical/legacy-manifest.json) preserves 54 file checksums. pg_dump changes equivalent cast expressions and dropped-column ordinal gaps, so the schemas have separate strict identities.

[Engine](../../server/scripts/migration-engine.js) uses one transaction/advisory lock; unknown schemas/files/history/checksums fail. [CLI](../../server/scripts/migrate.js) requires explicit DATABASE_URL and does not load implicit application credentials:

~~~sh
DATABASE_URL=<explicit-target> npm --prefix server run db:migrate -- --check
DATABASE_URL=<explicit-empty-target> npm --prefix server run db:migrate
DATABASE_URL=<reviewed-legacy-target> npm --prefix server run db:migrate -- --adopt-verified
~~~

--check uses a read-only transaction. --adopt-verified accepts only exact legacy 53/54-file history and strict final legacy fingerprint. For 53 it applies 047 atomically, checks the fingerprint, then records canonical history. Older/custom/untracked schemas require separate reviewed plans. Do not edit applied SQL; append migrations to the engine list and add manifest evidence.

[Compose](../../docker-compose.yml) initializes PostgreSQL alone, then [server image](../../server/Dockerfile) runs migration before API startup. Root build context packages canonical SQL and locked production dependencies. Disposable audits share this authority. [Container evidence](../audit/phase2/container-verification.json) separates PostgreSQL 15 smoke from full PostgreSQL 14 audit. No production deployment is authorized by these checks.

## Coverage and dependency mitigation

npm run test:coverage executes server unit tests with V8 coverage plus full real PostgreSQL/API/Playwright tests. [Collector](../../scripts/test-server-coverage.cjs) rejects failed/skipped tests, missing runtime coverage or changed server hashes, merges same-run evidence and enforces existing 70% thresholds for all four metrics. Standalone Babel Jest coverage remains separately reported and now passes all four thresholds after the [Jest expansion](../audit/phase2/jest-expansion/README.md); combined V8 metrics describe a different measurement.

Latest checked deepmerge remains 4.3.1. [Install mitigation](../../server/scripts/patch-deepmerge.cjs) verifies exact upstream hashes and replaces assignments with own data-property definitions in CJS/UMD/source. Idempotent postinstall skips absent development dependencies. [Security tests](../../server/tests/deepmerge-security.test.js) exercise poisoned/null-prototype targets, nested arrays and ordinary merges. Real versions and npm findings remain visible. Remove only after verifying a fixed upstream release.

Vendor endpoints enforce FINANCE_READ and payment POST additionally enforces FINANCE_WRITE. Payment notes are optional in API and browser; omitted/null notes persist as empty text in both payment and vendor ledger. Paid by remains required nonblank text, limited to 100 characters; missing payer rejects with 400 and no writes. [Vendor regression](../../tests/audit/corrections.spec.cjs) covers staff rejection, management-only end-date ledger filtering, missing-payer rollback, optional notes and source-linked journals.
