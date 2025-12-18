# PaymentModeService

## Purpose
The `PaymentModeService` provides a central mapping between operational payment labels (e.g., "Cash", "UPI", "HBL") and their corresponding General Ledger (GL) account codes. This decouples business logic from hardcoded accounting structures.

## Callers
- `PosService` (Order payments)
- `AdvanceService` (Advance/Repayment funding)
- `VendorPaymentService` (Bill settlements)
- `PayrollService` (Salary payouts)

## Method Breakdown

### `getAccountCode(paymentMode)`
- **Steps**: Query the `payment_modes` table for the `account_code` associated with the case-insensitive name.
- **Validation**: Throws an error if the mode is inactive or non-existent.

### `validatePayment(paymentMode, reference = null)`
- **Steps**: Checks if the specified payment mode requires a reference number (e.g., for Bank Transfers) and throws an error if it is missing.

## Transactions & Rollback Behavior
- **Read-Only**: This service primarily performs read operations. It does not manage its own transactions.

## Failure Modes
- **Configuration Error**: Returns error if a payment mode exists but is not linked to a valid GL account (enforced by DB constraints).

## Side Effects
- None; provides deterministic mapping for other services.
