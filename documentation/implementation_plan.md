# Implementation Plan - Finance Module Enhancements

# Goal Description
Bridge the gaps between the current Finance implementation and the Excel Tracker requirements. The main goals are to:
1.  Implement **Daily Transactions** properly with **Categories** and **Bank_Cash (Float)** mode.
2.  Implement **Reconciliation** for both Biller (Counter Cash) and Manager (Float).
3.  Ensure **P&L Monitoring** is accurate by syncing Daily Transactions to the accounting ledger.

## User Review Required
> [!IMPORTANT]
> **Database Changes**: We will need to modify the `transactions` table to include `mode` and update the `categories` handling. We will also add a `daily_balances` table to track opening/closing cash.
>
> **Workflow Change**: Users will now need to select a "Category" for every transaction. "Bank_Cash" transfers (Cash -> Manager) will be a specific transaction type.

## Proposed Changes

### Database
#### [NEW] `server/src/modules/finance/migrations/001_finance_updates.sql`
- Create `categories` table (id, name, type, parent_category).
- Add `mode` column to `transactions` table.
- Create `daily_balances` table (date, type: 'Counter'/'Float', opening_balance, closing_balance, status).

### Backend
#### [MODIFY] `server/src/modules/finance/TransactionService.js`
- Update `createTransaction` to save `mode`.
- **CRITICAL**: Update `createTransaction` to automatically create `Journal Entries` (Ledger Lines) for every transaction so they appear in P&L.
- Add logic: If Mode = 'Bank_Cash' and Type = 'Income', treat as **Transfer (Cash -> Float)**.
- Add logic: If Mode = 'Bank_Cash' and Type = 'Expense', treat as **Float Expense**.

#### [NEW] `server/src/modules/finance/ReconciliationService.js`
- Logic to fetch "Previous Day Closing" as "Today Opening".
- Logic to calculate "Theoretical Closing" = Opening + In - Out.
- End-of-day "Close" function to lock the balance.

#### [MODIFY] `server/src/modules/finance/controller.js`
- Expose new Reconciliation endpoints.
- Expose Categories endpoint.

### Frontend
#### [MODIFY] `client/src/pages/finance/DailyTracker.jsx`
- **[NEW] Multi-Row Entry Grid**: Implement an Excel-like editable grid or a "Batch Entry" form where the biller can add 5-10 rows at once (Date, Desc, Amount, Mode, Category) and click "Save All".
- Add **Category Dropdown** column (fetch from backend).
- Add **Transfer Mode** options.
- Ensure `vendor_id` is enforced correctly for expenses.

#### [MODIFY] `client/src/pages/finance/DailySummary.jsx`
- Show **Biller Reconciliation**:
    - Opening Cash (Auto-fetched)
    - + Cash Sales
    - - Cash Expenses
    - - Transfers to Manager
    - = Theoretical Closing
    - Input: Actual Closing
    - Result: Shortage/Overage

#### [NEW] `client/src/pages/finance/ManagerFloat.jsx`
- New view for Manager to see their Float status:
    - Opening Float
    - + Received from Biller
    - - Float Spent
    - = Current Float

### Expense Mapping Automation
#### [NEW] [expense_mappings.sql](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/server/src/modules/finance/migrations/002_expense_mappings.sql)
- **Schema**: `expense_mappings` table (`id`, `item_name`, `category_id`, `created_at`).
- **Goal**: Store rules for auto-categorization.

#### [NEW] [ExpenseMapping.jsx](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/client/src/pages/finance/ExpenseMapping.jsx)
- **Goal**: Admin interface to manage categorization rules.
- **Features**: List existing mappings, Add/Edit/Delete, "Apply to History" button.

#### [MODIFY] [finance.routes.js](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/server/src/modules/finance/routes.js)
- **Goal**: API support for mappings.
- **Endpoints**: CRUD for mappings, `POST /mappings/apply-history` to bulk update old transactions.

#### [MODIFY] [DailyTracker.jsx](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/client/src/pages/finance/DailyTracker.jsx)
- **Feature**: Auto-populate Category when user types a Description that matches a specific mapping rule.

### Audit & Single Source of Truth Fixes
#### [MODIFY] [payments.controller.js](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/server/src/modules/vendors/payments.controller.js)
- **Goal**: Ensure Vendor Payments are recorded in the central `transactions` table.
- **Change**: Insert a record into `transactions` with `type='Payment'`, `mode` (Cash/Bank), and `vendor_id`. This ensures `DailyTracker` and Cash Flow reports see the outflow.

#### [MODIFY] [DailyTracker.jsx](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/client/src/pages/finance/DailyTracker.jsx)
- **Goal**: Enforce data integrity.
- **Change**: Make `vendor_id` mandatory when `type === 'Expense'`. Update Summary logic to exclude `type='Payment'` from "Expenses" (P&L) but include in "Cash Outflow".

#### [MODIFY] [FinancialReports.jsx](file:///home/zohra/Desktop/zohra-rms/zohra-rms-v2/client/src/pages/reports/FinancialReports.jsx)
- **Goal**: Accountability.
- **Change**: Add a "Spending by Person" table aggregating `transactions` by `paid_by` user.

#### [MODIFY] `client/src/pages/Finance.jsx`
- Add **KPI Cards** (Food Cost %, Labor Cost %).
- Update P&L to use the now-synced Ledger data.

## Verification Plan

### Automated Tests
- Create `server/tests/finance_reconciliation.test.js` to test:
    - Opening balance carry-over logic.
    - Transfer logic (Cash decrease, Float increase).
    - P&L Sync (Transaction creation -> Ledger entry verification).

### Manual Verification
1.  **Daily Flow**:
    - Go to Daily Tracker.
    - Record a Cash Sale.
    - Record a Transfer to Manager (Bank_Cash Income).
    - Go to Daily Summary: Verify "Theoretical Closing" reduced by the transfer amount.
    - Go to Manager Float: Verify "Replenishment" increased by the transfer amount.
2.  **P&L Sync**:
    - Record a specialized expense (e.g., "Labor").
    - Go to Finance Dashboard.
    - Verify "Labor" expense appears in P&L and metrics (Labor Cost %).
