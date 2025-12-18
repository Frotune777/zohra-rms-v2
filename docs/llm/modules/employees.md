# Employees Module

## Responsibilities
- Centralized employee lifecycle management (CRUD).
- Attendance tracking (including bulk operations).
- Employee history logging for audit trails.
- Management of salary advances and recovery workflows.
- Core HR data provision for payroll processing.

## Folder Structure
- `server/src/modules/employees/`
    - `EmployeeService.js`: Core CRUD and history logic.
    - `AttendanceService.js`: Logic for fetching and saving daily attendance.
    - `AdvanceService.js`: Business rules for salary advances, requests, and approvals.
    - `PayrollService.js`: (Refactored) Logic for running payroll for individual employees with automated journaling.
    - `controller.js`: Orchestrates requests to the above services.
    - `routes.js`: Defines API endpoints for all employee and related sub-module actions.

## DB Tables Used
- `employees`: Core employee profiles (`name`, `position`, `salary`, `status`).
- `employee_history`: Audit log of changes to employee records.
- `attendance`: Daily records of employee attendance (`status`: Present, Absent, Half-Day, Sick Leave).
- `salary_advances`: Individual advance records with recovery status.
- `advance_ledger`: Transactional history of advances and repayments for balance calculation.
- `advance_requests`: Workflow table for pending advance approvals.

## Public Services & Methods
- **EmployeeService**: `getEmployees`, `createEmployee`, `updateEmployee`, `deleteEmployee`, `getEmployeeHistory`.
- **AttendanceService**: `getAttendance`, `saveBulkAttendance`.
- **AdvanceService**: `getAdvances`, `getEmployeeBalance`, `createRequest`, `getPendingRequests`, `approveRequest`, `rejectRequest`.

## Core Business Rules
- **Advance Balance**: An employee cannot have a negative advance balance (repayment > advance).
- **FIFO Advance Recovery**: (In legacy) Advances are typically recovered in First-In-First-Out order during payroll.
- **Attendance Impact**: Attendance status directly impacts prorated salary calculation in payroll.
- **Role Isolation**: Only `owner` and `manager` can perform destructive or financial employee actions.

## Accounting Impact
- **Advances**: Approval of an advance triggers a journal entry (Dr: Account 1100 - Advance Receivable, Cr: Cash/Bank).
- **Repayments**: Manual repayments or payroll deductions trigger a reversal journal entry (Dr: Cash/Expense, Cr: Account 1100 - Advance Receivable).

## Risks / Unclear Logic
- **Architecture Hybridity**: The system currently maintains both a refactored `PayrollService` (in this module) and a legacy `Payroll` module. Developers must ensure they are using the service-oriented paths.
- **Proration Logic**: Earned salary calculation assumes a standard `daysWorked / daysInMonth` factor across the module.
