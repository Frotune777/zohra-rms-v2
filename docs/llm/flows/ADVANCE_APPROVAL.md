# Advance Approval Flow

## Trigger
- An authorized user (Manager/Owner) clicks "Approve" on an `advance_request`.

## Sequential Steps
1. **Locking**: The request record is locked (`FOR UPDATE`) to prevent concurrent processing.
2. **Account Selection**: The system resolves the GL account for the specified `payment_mode` via `PaymentModeService`.
3. **Balance Check**: If the request is a 'Repayment', the system verifies the employee has sufficient outstanding balance.
4. **Financial Journaling**: `JournalService` creates a balanced entry:
    - **Dr**: Advance Receivable (1100).
    - **Cr**: Cash/Bank account (resolved).
    - *(Note: Entries are swapped for Repayment type).*
5. **Ledger Update**: A record is inserted into `advance_ledger` with the new calculated `balance_after`.
6. **Status Update**: The request status is changed to 'Approved' in `advance_requests`.

## Accounting Entries (Summary)
| Account | Dr | Cr | Description |
| :--- | :--- | :--- | :--- |
| **Advance Receivable** | ₹Amount | - | Asset created (for Advance) |
| **Cash/Bank** | - | ₹Amount | Asset reduced (for Advance) |

## Rollback Rules
- Full transactional atomicity: failure in any step reverts status change and ledger insertion. No journal entry is persisted if the workflow fails.
