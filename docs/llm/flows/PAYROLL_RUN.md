# Payroll Run Flow (Legacy)

## Trigger
- User clicks "Run Payroll" for a specific month/year.

## Sequential Steps
1. **Attendance Calculation**: System fetches attendance for the period and calculates `effectiveDays`.
2. **Proration**: Base salary and components are divided by total days in month and multiplied by `effectiveDays`.
3. **Advance Recovery**: System checks `advance_ledger` for outstanding balances and calculates the maximal recovery amount from the net pay.
4. **Draft Generation**: Record is inserted into `salary_history` with status 'Pending'. Breakdown is saved in `salary_history_components`.
5. **Approval**: User verifies the draft and updates status to 'Approved'.
6. **Payout (Funded)**:
    - Status is set to 'Paid'.
    - **Advance Recovery Logging**: If deductions exist, `salary_advances` are marked as recovered (FIFO) and a 'Repayment' entry is added to `advance_ledger`.
    - **Financial Journaling**:
        - **Recovery JE**: Dr: Accounts 6100 (Salary Expense), Cr: Account 1100 (Advance Receivable).
        - **Net Pay JE**: Dr: Account 6100 (Salary Expense), Cr: Cash/Bank account.

## Accounting Entries (Payout Phase)
| Account | Dr | Cr | Description |
| :--- | :--- | :--- | :--- |
| **Salaries Expense** | ₹Net + ₹Ded | - | Total gross earned amount |
| **Advance Receivable** | - | ₹Ded | Recovery of employee debt |
| **Cash/Bank** | - | ₹Net | Actual payout to employee |

## Payroll Stability Invariants
- **No Double Payout**: System prevents running or paying payroll for an employee/month that is already 'Paid'.
- **Safe Reversal**: Deleting a 'Paid' payroll triggers financial reversal entries and restorative entries in the `advance_ledger`.

## Rollback Rules
- All payout steps (status update, ledger update, journaling) are wrapped in a single database transaction. Failure in any step rolls back the payout, leaving the record as 'Approved'.
