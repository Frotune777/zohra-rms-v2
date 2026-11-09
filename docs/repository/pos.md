# POS table ordering

POS opens at / with dining tables **1–12**. Selecting a tile opens the menu and cart at `/?table=<value>` and carries that table into the order. The table is shown as a heading; there is no manual table-number input. Delivery and Pick Up remain available on the home page and in the order tabs. Back to tables preserves an unfinished cart. Successful checkout clears the selected draft and leaves that table ready for another order; changing tables uses the home page.

[POS.jsx](../../client/src/pages/POS.jsx) owns both the home and keyed order component. Its query parameters make table selection survive reload and browser back/forward. [App.jsx](../../client/src/App.jsx) continues mounting POS at the authenticated root route.

## Table list

[GET /api/tables](../../server/src/modules/pos/routes.js) requires POS_ACCESS, available to owner, manager and staff. [PosService.getTables](../../server/src/modules/pos/service.js) reads config_options category dining_tables, sorted by display order and value, and returns active value/label entries. With no configured rows it returns tables 1–12 without writing database rows. An existing catalog whose rows are all inactive returns an empty list; default tables do not reappear.

Owner/manager [Configuration → Dining Tables](../../client/src/pages/config/ConfigManager.jsx) can **Load tables 1–12** using the existing transactional bulk-import API, then rename, reorder, add or deactivate entries. This preserves historical order table strings, including custom labels such as A7. Staff receive only the POS table catalog; they gain no configuration-management access. No schema or canonical checksum change is required. Deleting every configured row restores the default list; deactivate entries to disable all tables.

Table tiles show local saved-cart item counts. These counts describe the current actor's session draft; they do not establish occupancy or synchronize an open restaurant bill across devices. Existing checkout still commits one order, payment/debt, stock deductions and kitchen ticket atomically. The API retains historical arbitrary/optional table strings for existing callers; the new UI selects from the catalog.

## Customer and financial contract

Customer phone is optional for Cash, Card, Due and Part, and for Dine In, Delivery and Pick Up. Omitted, null, empty or whitespace-only phone values are accepted. Supplied non-null name, phone, table and notes values must be strings. Trimmed customer name/phone lengths respect the customers schema (100/20 characters).

A supplied phone retains the existing phone-based customer upsert. A name without a phone creates a distinct customer row for each order; names are not a unique identifier. Without either contact field, customer_id is null. Debt remains linked to the order and receivable 1120. Due records no initial payment; Part still requires a positive payment strictly below the total. [Orders & Payments](../../client/src/pages/operations/OrderPayments.jsx) can collect the remaining balance without adding a phone. Stored menu prices, discount-before-tax allocation, exact journals, stock valuation and kitchen-ticket behavior remain in [PosService](../../server/src/modules/pos/service.js).

## Drafts and retries

Session keys are ``pos-draft:<actor>`:table:<encoded-value>` or ``pos-draft:<actor>`:type:<Delivery|Pick Up>`. Switching between tables/order types mounts a component keyed to the selected draft; it preserves cart, customer, notes, discount, payment mode and failed-checkout retry. Empty carts remove their draft. These sessionStorage drafts persist through reload in the same browser tab and use the authenticated AuthContext user ID, even when localStorage has no user profile. Real account switching preserves separate drafts.

The earlier `pos-draft:<actor>` format, including the old unscoped `pos-draft:session` draft, remains accessible through **Resume previous saved order**. It preserves the original table value (including an unassigned table) and retry request rather than silently assigning a new table or discarding items. Unchanged requests compare object fields canonically before reusing their Idempotency-Key; field insertion order does not produce a duplicate checkout. The old unscoped draft has no recorded owner and is offered only through explicit legacy resume; new drafts always use authenticated ownership. Changed requests receive a new key. The server retains actor-scoped advisory locks and JSONB equality checks. Printing occurs only after the committed response and receipt render. Cart/customer/payment controls and table navigation are disabled while checkout is pending.

## Verification ownership

- [Client POS tests](../../client/src/tests/POS.test.jsx): table home/selection, optional phone payloads, cart/filter behavior, table/type/actor isolation, reload retry keys and legacy drafts, bad links/corrupt storage, loading failures/retry, pending controls and printing.
- [Real Jest integration](../../server/tests/pos-tables.integration.test.js): guarded PostgreSQL/Express role permissions, defaults and managed catalog, all four phone/payment combinations, exact persisted customers/table/payment/receivable/COGS/stock/tickets, settlement/retry identity, malformed input and late-failure rollback.
- [Playwright table audit](../../tests/audit/pos-tables.spec.cjs): every table 1–12, owner/manager/staff phone-free debt and settlement, browser back/reload/draft isolation, non-table orders, load failures, configuration editing, phone/tablet/desktop checkout and invalid partial rollback.
- [Existing POS/inventory](../../tests/audit/pos-inventory.spec.cjs) and [completion](../../tests/audit/completion.spec.cjs): pricing, discounts/tax, custom selected table, stock/concurrency, printing and committed-response-loss retry. [Screen audit](../../tests/audit/screens.spec.cjs) verifies the new home on root navigation/reload/viewports.

Executed counts and source hashes belong in the [POS change evidence](../audit/phase2/pos-tables/README.md) and [current audit](../audit/phase2/README.md). The preceding completed 439/439 browser checkpoint is archived [before this change](../audit/phase2/before-pos-tables/scope.md). Wider feature checklist scope remains partial.
