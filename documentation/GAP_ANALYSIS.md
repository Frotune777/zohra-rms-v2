# Gap Analysis: Project vs Excel Tracker Requirements

## I. Input Sheet: Daily Transactions

| Feature | Requirement | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Date** | Biller records date | implemented (`DailyTracker.jsx` -> `transactions.date`) | ✅ Implemented |
| **Amount** | Transaction Value | Implemented (`transactions.amount`) | ✅ Implemented |
| **Mode** | Cash, Bank, Bank_Cash | Partially Implemented. 'Cash' & 'Bank' exist as payment methods. **'Bank_Cash' (Float)** is MISSING. | ⚠️ Partial |
| **PnL Type** | Income (Sales) / Expense | Implemented as `type` ('Sales'/'Expense'). | ✅ Implemented |
| **PnL Category** | Specific categories (COGS - Grocery, OpEx - Labor) | **MISSING**. database has `category_id` but UI does not allow selection. No standard category list. | ❌ Missing |
| **Logic** | Income = Sales, Expense = PnL deduction | Implemented in `transactions` but **NOT linked to Financial P&L** (which reads `ledger_lines`). | ❌ Disconnected |
| **Bank_Cash Logic** | Transfer logic (Counter -> Manager, Manager Spending) | **MISSING**. No distinction for transfers or float management. | ❌ Missing |

## II. Reconciliation Sheet

### A. Biller Counter Cash
| Feature | Requirement | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Opening Cash** | Carried from previous day | **MISSING**. No persistence of closing cash to next day's opening. | ❌ Missing |
| **Cash Inflow** | Cash Sales | Implemented (`FinancialCalculator` sums Cash Sales). | ✅ Implemented |
| **Cash Outflow** | Cash Expenses | Implemented (`FinancialCalculator` sums Cash Expenses). | ✅ Implemented |
| **Transfer Out** | Cash to Manager | **MISSING**. No logic to track transfers to Manager. | ❌ Missing |
| **Theoretical vs Actual** | Formula based verification | **MISSING**. UI shows "Remaining Cash" but no comparison against physical count input. | ❌ Missing |

### B. Manager Float Reconciliation
| Feature | Requirement | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Manager Float** | Rolling balance of Manager's cash | **MISSING**. Completely absent. | ❌ Missing |

## III. Monitoring Sheet (Management P&L)

| Feature | Requirement | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **True P&L** | Revenue - COGS - OpEx | Implemented in `Finance.jsx` but **reads from `ledger_lines`**, meaning it misses data from `DailyTracker`! | ⚠️ Critical Bug |
| **KPIs** | Food Cost %, Labor Cost % | **MISSING**. Only "Profit Margin" is shown. | ❌ Missing |
| **Accountability** | Report on "Who spent what" | **MISSING**. `paid_by` is captured but no report exists. | ❌ Missing |

## Summary of Work Required
1.  **Database Updates**:
    *   Add `categories` table or enum.
    *   Add `mode` or strictly define `payment_method` to include 'Bank_Cash'.
    *   Add `opening_balance` tracking for Cash and Float.
2.  **Daily Tracker UI**:
    *   Add **Category Selection**.
    *   Add **Transfer Mode** (Cash -> Bank_Cash).
3.  **Reconciliation Logic**:
    *   Implement "Opening Cash" logic.
    *   Implement "Manager Float" tracking.
4.  **Backend Integration**:
    *   **CRITICIAL**: Connect `DailyTracker` (Transactions) to `Journal/Ledger` so P&L is accurate.
5.  **Reports**:
    *   Create detailed P&L breaking down by Category (COGS vs OpEx).
    *   Create KPIs.
    *   Create Spending Report.
