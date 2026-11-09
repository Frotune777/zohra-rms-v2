# Manual testing with sample data

The application was restarted with the completed workflows and the preserved sample database on 9 November 2026 at 09:40 UTC with the POS table update at **http://localhost:3002**, using API **http://127.0.0.1:5001**. macOS Control Center owns port 5000. The [demo runner](../../scripts/start-demo.cjs) starts the real API and Vite client against a fresh guarded zohra_pw_manual_* database on the existing local audit PostgreSQL cluster, preserving earlier databases and audit results.

| Role | Email | Password |
| --- | --- | --- |
| Owner | owner@alzohra.com | owner123 |
| Manager | manager@alzohra.com | manager123 |
| Staff | staff@alzohra.com | staff123 |

Each account has a bcrypt password hash. [POS startup verification](../audit/phase2/pos-tables/manual-verification.json) confirms real API and Chromium logins for all three roles with no uncaught page errors, exactly 12 table tiles, Table 12 selection and optional phone. Owner and manager passed seven route headings and nine API reads; staff passed two operational route headings and three API reads. This establishes startup and initial rendering only. [Repair verification](../audit/phase2/repair-verification.md) records deeper feature scenarios and remaining scope.

[POS startup verification](../audit/phase2/pos-tables/manual-verification.json) records the latest frontend/API checks. [Earlier startup evidence](../audit/phase2/manual-startup-verification.json) retains the preceding checkpoint; neither dated check guarantees a later process is still running.

The sample data includes base-schema menu, recipes, inventory and five employees; two suppliers, current rates, a markup rule, recent attendance and a balanced opening journal are added. Employee wallets are linked. The resumed database has verified 54-file legacy history and adopted canonical history; see [migration contracts](corrections-and-valuation.md). Fresh demos explicitly seed synthetic users, employees, menu and stock. Sample balances and employee attendance are fixtures rather than imported business data.

With the Node runtime in .nvmrc selected and pg_ctl on PATH, restart from the repository root with:

```sh
npm run dev:demo
```

Ports 3002 and 5001 must be free; the runner does not kill their existing owners. The default invocation creates a new database. Resume without reseeding by setting ZOHRA_DEMO_DATABASE to the name in /private/tmp/zohra-manual-runtime.json. Ctrl+C stops only its API/client children; the sample database and PostgreSQL cluster are retained. When Codex started the process, ask it to stop/restart that instance before running another. Runtime details and logs are local at /private/tmp/zohra-manual-runtime.json and /private/tmp/zohra-manual-app.log.

The runner reuses the explicit [canonical schema and audit guard](../../tests/audit/database.cjs), verifies PostgreSQL’s actual cluster directory, and creates a uniquely named disposable database. Canonical initialization and separate Docker/PostgreSQL 15 smoke are verified; production data migration is outside this evidence. It runs without the audit’s fixed business clock, using normal application time.

The employee filter in [Advances](../../client/src/pages/Advances.jsx) now uses the configured API base, and its filtered API response is verified in the startup artifact. POS is available directly at / and through the active Restaurant Operations navigation. Orders & Payments and Kitchen are available to authenticated users; Recipes, Purchase Orders, Wastage, Stock Adjustments and Employee Balances are available to owner/manager. Existing sessions may need to log in again after a restart because each runner invocation generates a new JWT secret.

The POS table update was restarted on the preserved sample database on 9 November 2026. [POS startup verification](../audit/phase2/pos-tables/manual-verification.json) at 2026-11-09T10:06:50.738Z passed real owner/manager/staff logins, tables 1–12, Table 12 selection, optional phone and operational API reads without saving orders. See [POS contracts](pos.md) for table carts and retries. Existing browser sessions need to log in again after the restart.
