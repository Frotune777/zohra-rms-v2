# AdvanceService

## Purpose
The `AdvanceService` manages the full lifecycle of salary advances and repayments, ensuring that employee receivables are accurately tracked and journaled.

## Callers
- `EmployeesController` (Requests, Approvals, History)
- `PayrollService` (Repayment logging - in some flows)

## Method Breakdown

### `createRequest(data, userId)`
- **Steps**: Inserts a pending record into `advance_requests`.
- **Status**: Status defaults to 'Pending'.

### `approveRequest(id, userId, client)`
- **Steps**:
    1. Locks the request record (`FOR UPDATE`).
    2. Validates balance if the request is a `Repayment`.
    3. Calculates `newBalance`.
    4. Resolves the GL account for the selected `payment_mode`.
    5. Triggers `JournalService.createJournalEntry` (Dr: Advance Receivable, Cr: Cash for Advances; or Swapped for Repayments).
    6. Inserts a record into `advance_ledger` with `journal_entry_id` link.
    7. Updates request status to 'Approved'.
- **Transactions**: Requires an external `client` to ensure request status and ledger update are atomic.

### `getEmployeeBalance(employeeId)`
- **Steps**: Aggregates `Advance` vs `Repayment` transactions in the `advance_ledger`.

## Transactions & Rollback Behavior
- **Pessimistic Locking**: Uses `FOR UPDATE` on requests to prevent race conditions during concurrent approval clicks.
- **Full Rollback**: If journaling or ledger insertion fails, the request status remains 'Pending'.

## Failure Modes
- **Over-Repayment**: Throws error if a manual repayment request exceeds the employee's current outstanding balance.
- **Double Processing**: Error if the request is not in 'Pending' state.

## Side Effects
- Updates the `advance_ledger` which is used for real-time balance checks in the Payroll module.
