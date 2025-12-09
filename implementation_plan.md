# Implementation Plan - Migrate Chicken Tracker to RMS v2

## Goal Description
Fully migrate the functionality of the Python Streamlit "Chicken Rate & Bill Tracker" application into the main `al-zohra-rms-v2` stack (Node.js, Express, React, PostgreSQL). This ensures a unified codebase, single database, and consistent UI/UX.

## User Review Required
> [!IMPORTANT]
> This plan involves **rewriting** the Python logic in JavaScript and creating new PostgreSQL tables. The existing `python_app` service added in the previous step will be removed.

## Proposed Changes

### 1. Database Schema (PostgreSQL)
We will add the following tables to `database/init.sql` (or a new migration file):

- **`suppliers`** (Migrated from `Suppliers`)
  - `id` (SERIAL PK), `name`, `phone`, `payment_type`, `vendor_type`, `markup_required`
- **`markup_rules`** (Migrated from `Markups`)
  - `id`, `supplier_id` (FK), `item_name`, `base_rate_type`, `op1`, `val1`, `op2`, `val2`
- **`daily_rates`** (Migrated from `RawData`)
  - `date` (PK), `tandoor_rate`, `boiler_rate`, `egg_rate`
- **`bill_entries`** (Migrated from `BillEntries`)
  - `id`, `date`, `supplier_id` (FK), `item_name`, `qty`, `vendor_rate`, `expected_rate`, `variance`, `status`
- **`vendor_ledger`** (Migrated from `VendorLedger`)
  - `id`, `date`, `supplier_id` (FK), `type`, `amount`, `details`

### 2. Backend (Node.js/Express)
#### [NEW] Routes & Controllers
- `server/src/routes/chicken.routes.js`: Endpoints for rates, bills, and vendors.
- `server/src/controllers/chicken.controller.js`: Logic for:
    - Fetching/Saving daily rates.
    - Managing suppliers and markup rules.
    - **Rate Calculation Logic**: Porting the Python `calculate_expected_rate` function to JavaScript.
    - Processing bill entries and calculating variance.

### 3. Frontend (React)
#### [NEW] Components (`client/src/pages/chicken/`)
- `DailyRates.jsx`: Form to enter Tandoor/Boiler/Egg rates.
- `BillEntry.jsx`: Interface to enter bills, select vendor, auto-calculate expected rates.
- `VendorManager.jsx`: CRUD for suppliers and configuring markup rules.
- `ChickenDashboard.jsx`: Charts for variance and rate trends (using Recharts).

#### [MODIFY] App Structure
- Add "Chicken Tracker" section to the main Sidebar.
- Add routes in `App.jsx`.

### 4. Cleanup
- Remove `python_app/` directory.
- Remove `python_app` service from `docker-compose.yml`.
- Revert `README.md` changes related to the separate Python service.

### 5. New Features (Phase 4)
#### [NEW] Attendance Module
- **Database**: `attendance` table (`id`, `date`, `employee_id`, `status`, `check_in`, `check_out`).
- **Backend**: `POST /api/attendance/bulk` to save status for all active employees.
- **Frontend**: `BulkAttendance.jsx` with a list of employees and radio buttons (Present/Absent/Half-day).

#### [NEW] Financial Tracking
- **Payment Tracker**:
  - **Database**: Use `vendor_ledger` with `transaction_type = 'Payment'`.
  - **Frontend**: `PaymentEntry.jsx` to record payments to vendors.
- **Daily Summary**:
  - **Backend**: `GET /api/finance/daily-summary` aggregating Sales (POS), Expenses (Ledger), and Payments.
  - **Frontend**: `DailySummary.jsx` mimicking the Excel sheet structure.

#### [MODIFY] UI Enhancements
- **VendorManager.jsx**: Add inputs for `Operator 2` and `Value 2`.
- **BillEntry.jsx**:
  - Replace Item input with `<select>` dropdown.
  - Add validation: `Entered Total` vs `Calculated Total`.

## Verification Plan
### Automated Tests
- Verify server starts with new routes.
- Verify database tables are created.

### Manual Verification
1. **Vendor Setup**: Create a test supplier with markup rules (including Op2).
2. **Rate Entry**: Enter daily rates.
3. **Bill Entry**: Select item from dropdown, verify validation logic.
4. **Attendance**: Mark bulk attendance and verify DB records.
5. **Summary**: Check Daily Summary against recorded transactions.

### HR & Payroll Enhancements (Phase 5)

#### Database Schema
- **`employee_history`**: `id`, `employee_id`, `field_changed`, `old_value`, `new_value`, `changed_by`, `changed_at`
- **`advance_ledger`**: `id`, `employee_id`, `type` (Advance/Repayment), `amount`, `balance_after`, `notes`, `date`
- **`salary_history`**: Add `manual_adjustment`, `adjustment_reason`, `total_days_in_month`

#### Backend Changes
- **`employees.js`**:
    - Update `updateEmployee` to insert into `employee_history` when salary/role/position changes.
- **`payroll.js`**:
    - `calculatePayroll`: `(base_salary / days_in_month) * days_worked`.
    - Add endpoint to approve/adjust payroll.
- **`advances.js`**:
    - Refactor to use `advance_ledger`.
    - `getEmployeeBalance`: Sum of advances - Sum of repayments.

#### Frontend Changes
- **`EmployeeList.jsx`**:
    - Add "History" view.
    - Improve "Add Employee" form (Auto-gen ID is handled by DB, but maybe show it).
- **`Advances.jsx`**:
    - Show ledger table instead of simple list.
    - Add "Repayment" option.
- **`Payroll.jsx`**:
    - Allow editing "Days Worked" and "Adjustment" before processing.

## Verification Plan (HR Phase)

### Automated Tests
- Test payroll calculation with different month lengths.
- Test advance balance updates (Advance + Repayment).
- Test history logging.

### Manual Verification
- Create employee, change salary, verify history.
- Give advance, deduct from salary, verify balance.
- Run payroll for a month, adjust manually, verify final amount.
