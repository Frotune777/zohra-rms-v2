# Advance Requests Module

## Responsibilities
- Management of form-based salary advance requests.
- Tracking and managing repayment schedules.
- Maintaining an audit trail of request approvals and adjustments.

## Folder Structure
- `server/src/modules/advance-requests/`
    - `controller.js`: Orchestrates request submission, approval (with repayment generation), and rejection.
    - `routes.js`: API endpoints.

## DB Tables Used
- `advance_requests`: Primary request data and status.
- `advance_repayment_schedule`: Calculated monthly deductions for approved advances.
- `advance_audit_log`: Detailed log of state changes.

## Public Services & Methods
- **Controller Methods**:
    - `createAdvanceRequest`: Records a new request with desired repayment months.
    - `approveAdvanceRequest`: Locks the request, sets the approved amount, and generates the `advance_repayment_schedule`.
    - `getRepaymentSchedule`: Returns the month-by-month breakdown for a specific request.

## Core Business Rules
- **Repayment Generation**: Upon approval, the system automatically creates N records in `advance_repayment_schedule` where N is the `repayment_months` value.
- **Locking**: Uses `BEGIN/COMMIT` and `FOR UPDATE` (via shared services) to ensure data consistency during approval.

## Accounting Impact
- Coordinates with `AdvanceService` for the actual financial journaling (Dr: Advance Receivable, Cr: Cash).

## Risks / Unclear Logic
- **Schedule vs Ledger**: The `advance_repayment_schedule` is a separate plan from the actual `advance_ledger` transactions. Discrepancies can occur if manual adjustments are made to the ledger without updating the schedule.
