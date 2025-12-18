# Payroll Module

## Responsibilities
- Batch processing of monthly payroll for all active employees.
- Prorated salary calculation based on attendance and salary components.
- Management of complex payroll workflows (Draft -> Approved -> Paid).
- Automated advance recovery from monthly net pay.
- Maintenance of salary history and breakdown components.

## Folder Structure
- `server/src/modules/payroll/`
    - `controller.js`: Contains a heavy, procedural implementation of the entire payroll lifecycle.
    - `routes.js`: API endpoints for running, approving, paying, and reverting payroll.

## DB Tables Used
- `salary_history`: Record of each payroll run per employee per month (`net_pay`, `status`).
- `salary_history_components`: Detailed breakdown of earnings and deductions for each history record.
- `salary_components`: Master list of earning/deduction types.
- `employee_salary_structure`: Mapping of components to specific employees.
- `payroll_audit_log`: Logs all payroll transitions and deletions.

## Public Services & Methods
- **Controller Methods**:
    - `runPayroll`: Generates payroll drafts (idempotent).
    - `getMonthlyPayroll`: Fetches payroll for a specific period.
    - `approvePayroll`: Transitions records from 'Pending' to 'Approved'.
    - `markPaid`: Finalizes payment and triggers financial journaling.
    - `deletePayroll` / `revertPayroll`: Administrative tools for corrections.

## Core Business Rules
- **Three-Step Workflow**: Payroll must be drafted (Pending), verified (Approved), and then funded (Paid).
- **Idempotency**: `runPayroll` can be re-run indefinitely as long as the status is 'Pending'.
- **Safe Correction**: Paid payroll cannot be deleted without reversal of financial ledger entries and advance ledger adjustments.
- **Advance Recovery**: Automatically calculates max possible deduction from net pay to recover outstanding advances.

## Accounting Impact
- **Payout**: Triggers multiple journal entries:
    - **Salaries Expense**: Dr: Account 6100 (Salaries Expense), Cr: Cash/Bank.
    - **Advance Recovery**: Dr: Account 6100 (for deduction amount), Cr: Account 1100 (Advance Receivable).

## Risks / Unclear Logic
- **Legacy Logic**: This module contains high-complexity procedural code with embedded SQL and manual transaction management. It is a high-risk area compared to the refactored `EmployeeService.PayrollService`.
- **Manual Mapping**: Account codes like `6100` (Salaries) and `1100` (Advances) are partially hardcoded in the legacy controller.
- **Unclear Rollback**: Complex `delete` logic attempts to reverse manual SQL steps, which may be fragile under certain database states.
