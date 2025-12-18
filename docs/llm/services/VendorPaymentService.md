# VendorPaymentService

## Purpose
The `VendorPaymentService` manages the lifecycle of payments to suppliers, ensuring that vendor debts are properly recorded and reconciled with the general ledger.

## Callers
- `VendorPaymentsController` (Processing payments)

## Method Breakdown

### `processPayment({ vendorId, amount, paymentMode, ... }, client)`
- **Steps**:
    1. Validates that the vendor exists.
    2. Checks the `vendor_outstanding` view to ensure the payment amount does not exceed the current debt.
    3. Records the payment in `vendor_payments`.
    4. Inserts a 'Payment' record into the `vendor_ledger`.
    5. Resolves the GL account for the `paymentMode` via `PaymentModeService`.
    6. Triggers `JournalService.createJournalEntry` (Dr: Account 2000 - Vendor Payable, Cr: Cash/Bank Account).
    7. Links the journal entry ID back to the payment record.
- **Transactions**: Atomic; requires an external `client` for full safety across multiple table updates and journaling.
- **Rollback**: Rollback occurs if the journal entry is imbalanced or if a database constraint is violated during ledger insertion.

### `getVendorDetails(id)`
- **Steps**: Fetches composite data from `vendor_outstanding` and performs an inline SQL aggregation for aging (0-30, 30-60, 60-90, >90 days).

## Transactions & Rollback Behavior
- **Data Integrity**: Uses standard transactions to ensure the `vendor_ledger` and `vendor_payments` tables are selalu in sync with the `journal_entries` table.

## Failure Modes
- **Overpayment**: Throws error if `amount > outstanding`.
- **Invalid Account**: Caught during `JournalService` validation.

## Side Effects
- Updates real-time outstanding balances visible in the Dashboard and Vendor modules.
