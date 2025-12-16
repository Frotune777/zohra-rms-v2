# Project Logic & Integration Analysis

This document details the business logic, workflows, and integrations across all modules of the Al Zohra RMS.

## 1. Authentication & RBAC
**Location**: `server/src/modules/auth`, `middleware/auth.js`, `middleware/rbac.js`

- **Logic**:
  - **Login**: Validates email/password against `users` table. Uses `bcrypt` for hash comparison. Returns JWT token.
  - **Permissions**:
    - **Middleware**: `verifyToken` extracts user data. `requirePermission` checks granular permissions.
    - **Roles**: Owner (all access), Manager, Staff.
    - **Hardcoded Demo**: Allows specific demo passwords for testing.

## 2. Finance Module
**Location**: `server/src/modules/finance`, `Bank Accounts`, `Tax Rates`

- **Core Logic (Double-Entry)**:
  - **Journal Entries**: Every financial action creates a `journal_entries` record.
  - **Ledger Lines**: Each entry has balanced debit/credit lines in `ledger_lines`.
  - **Reconciliation**: Tracks daily cash counter closing vs expected system sales.
  - **P&L**: Real-time aggregation of Revenue vs Expenses items from the ledger for any date range.

- **Integrations**:
  - **Payroll -> Finance**: Salary payouts create journal entries Dr Salaries Expense / Cr Cash.
  - **Inventory -> Finance**: PO reception creates Vendor Ledger entries (Accounts Payable).
  - **POS -> Finance**: Sales create Revenue journal entries.

## 3. Inventory & Procurement
**Location**: `server/src/modules/inventory`

- **Core Logic**:
  - **Stock Management**: Tracks `stock_qty` and `unit_cost`.
  - **Purchase Orders (PO)**:
    - **Draft**: Created with items.
    - **Received**: Auto-updates `inventory_items.stock_qty` and `unit_cost` (weighted average potential). Auto-creates **Vendor Bill** (Liability).
  - **Wastage**: Logs lost stock and calculates cost impact.

- **Chicken/Vendor Logic (Integrated)**:
  - **Daily Rates**: Stores market rates (Tandoor, Boiler, Egg) daily.
  - **Bill Entry**: Records supplier bills. Validates against `daily_rates` + `markup_rules` (e.g. Rate + ₹5).
  - **Variance**: Calculates expected cost vs actual vendor bill amount.
  - **Vendor Ledger**: Tracks payments vs bills for each supplier.

## 4. HR & Payroll
**Location**: `server/src/modules/employees`, `server/src/modules/payroll`

- **Core Logic**:
  - **Employee Management**: Tracks details + Expiry dates (Visa, etc).
  - **Attendance**: Daily status (Present/Absent/Half-Day). Used for payroll calculation.
  - **Advances**:
    - **Wallet**: Employees have a running advance balance.
    - **Recovery**: Auto-deducts from payroll or manual repayment.
  - **Payroll (Run)**:
    - **Component-Based**: Uses `employee_salary_structure` (Basic, HRA).
    - **Pro-Rata**: Calculates `(ComponentAmount / DaysInMonth) * DaysWorked`.
    - **Breakdown**: Stores detailed split in `salary_history_components`.
    - Adds Overtime/Manual Adjustments.
    - **Auto-Deduction**: Checks `advance_ledger` balance and deducts (up to net pay).
    - Status: Pending -> Approved -> Paid.

- **Integrations**:
  - **Payroll -> Finance**: "Mark Paid" triggers Journal Entry creation.
  - **Payroll -> Advances**: Recovery updates `advance_ledger` and `salary_advances`.

## 5. POS & Orders
**Location**: `server/src/modules/pos`, `server/src/modules/operations/kds.controller.js`

- **Core Logic**:
  - **Menu**: Items with categories and prices.
  - **Order Creation**:
    - Calculates totals.
    - Links to `customers` (Membership/Loyalty).
    - Status: Pending -> Completed.
  - **KDS (Kitchen Display)**:
    - WebSocket events (`new_ticket`, `ticket_updated`) sent to kitchen screen.
    - Tracks preparation time.

- **Integrations**:
  - **POS -> KDS**: Order creation triggers KDS ticket.
    - **POS -> Inventory**: (Implemented) Real-time recipe deduction on sale via `inventory_transactions`.
  - **POS -> Finance**: (Implemented) Order completion creates separate `payment_transactions` and `journal_entries` (Revenue + COGS).

## 6. Reports & Analytics
**Location**: `server/src/modules/reports`

- **Logic**:
  - **Financial**: Aggregates `ledger_lines` for Balance Sheet and P&L.
  - **HR**: Aggregates `salary_history` and `attendance` stats.
  - **Operations**: Analyzes `bill_entries` variance and `wastage_logs`.
  - **Inventory**: Stock value valuation.
  - **Dashboard**: High-level KPIs combining data from all modules.

## 7. Systemic Controls (P2 Improvements)
**Location**: `database triggers`, `middleware`

- **Audit Trails**:
  - **Logic**: Use DB triggers on `menu_items`, `employees`, `users`, `suppliers`.
  - **Storage**: JSON blobs (Old vs New) in `audit_logs`.
- **Financial Periods**:
  - **Logic**: Locking mechanism for months. 
  - **Enforcement**: `check_period_open()` trigger prevents Insert/Update on `journal_entries` if date is in a Closed period.

## Summary of Data Flow (Enhanced)
1.  **Sales Cycle**: 
    - POS Order -> `payment_transactions` (Cash/Bank) -> `journal_entries` (Revenue).
    - Concurrent -> `inventory_transactions` (Recipe Deduction) -> `journal_entries` (COGS).
2.  **Procurement Cycle**:
    - PO -> Receive -> `inventory_transactions` (Stock In) -> Vendor Bill -> `journal_entries` (Payable).
3.  **Payroll Cycle**:
    - `employee_salary_structure` + Attendance -> `runPayroll` (Pro-rata) -> `salary_history_components` -> Payout -> `journal_entries` (Expense).
4.  **Reporting**:
    - Daily Tracker reads `payment_transactions`.
    - P&L reads `ledger_lines`.
    - System prevents back-dating via `financial_periods`.