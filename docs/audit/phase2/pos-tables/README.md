# POS table-selection change evidence

The POS home now shows tables 1–12, opens the chosen table's cart, and submits its table automatically. Customer phone is optional for all payment modes. [Source contracts and test ownership](../../../repository/pos.md) document the implementation.

The [27-case final focused run](final-focused/results.json) passed table selection/checkout, phone-free debt and settlement, table/type draft isolation, loading failure recovery, configuration management and three viewport checkouts. Both legacy retry cases and real account switching also passed. Focused evidence is not a complete repository run.

The first focused run was interrupted after hidden radio targets prevented two payment cases from reaching checkout. [Its retained evidence](first-focused/scope.md) includes 43 passes, 2 failures, 1 interrupted and 9 unexecuted cases. The [second run](second-focused/scope.md) had 22 passes and two locator failures: the shared API alert also matched the menu-alert query, and the table edit query selected a nested child rather than the whole row. Corrected visible-label and scoped group/alert interactions passed the 24-case run without changing assertions or timeouts.

The [first full Jest run](jest-first.json) had 589 passes and one failure: exact journal lines were returned in the opposite array order, which the API does not guarantee. The assertion now sorts by account before comparing every account/debit/credit value. The financial behavior was unchanged.

[Manual demo verification](manual-verification.json) confirms real owner/manager/staff logins, exactly 12 table tiles, selecting Table 12, no table-number input, optional phone, operational route headings and API reads, with no uncaught page errors. This read-only check preserved the sample database.

The final full audit and coverage results are recorded in [current phase 2 evidence](../README.md). The [first full POS run](full-first/scope.md) passed 463/465 and exposed the inherited user-ID lookup: real login stores the user in AuthContext, while POS read localStorage.user and fell back to an unscoped session draft. New drafts now use authenticated ownership; the [27-case final focused follow-up](final-focused/results.json) passes both legacy retries and real account switching. [Client results](client-results.json), [Jest results](jest-results.json), [production build](build.log), and final verification metrics remain separate evidence artifacts. The earlier completed 439/439 browser and 556/556 Jest checkpoint is [archived before this change](../before-pos-tables/scope.md). All wider feature checklist IDs retain partial scope.

The final full audit passed **466/466** browser checks. Jest passed **590/590**, client tests passed **80/80**, and the production build passed. Both default Babel and same-run V8 coverage passed the unchanged 70% thresholds. [Final verification](verification.json) records source hashes and exact metrics.

