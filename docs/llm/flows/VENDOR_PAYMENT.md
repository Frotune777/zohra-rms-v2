# Vendor Payment Flow

## Trigger
- User submits the "Process Vendor Payment" form.

## Sequential Steps
1. **Validation**: System verifies that the vendor exists and the payment amount does not exceed the outstanding balance.
2. **Account Resolution**: The system resolves the GL account for the `payment_mode` (e.g., Cash, Bank).
3. **Log Creation**: Initial payment record is added to `vendor_payments`.
4. **Ledger Updating**: A 'Payment' transaction is added to `vendor_ledger`.
5. **Financial Journaling**: `JournalService` creates a balanced entry:
    - **Dr**: Vendor Payable (2000).
    - **Cr**: Cash/Bank/UPI account (resolved).
6. **JE Linking**: The ID of the created journal entry is saved back to the `vendor_payments` record.

## Accounting Entries (Summary)
| Account | Dr | Cr | Description |
| :--- | :--- | :--- | :--- |
| **Vendor Payable** | ₹Amount | - | Liability reduced |
| **Cash/Bank** | - | ₹Amount | Asset reduced |

## Rollback Rules
- Atomic transaction: failure during journaling or ledger update rolls back the vendor payment record creation.
