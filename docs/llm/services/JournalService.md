# JournalService

## Purpose
The `JournalService` is the central engine for the Al Zohra RMS double-entry accounting system. It ensures that every financial movement is balanced, attributed, and persisted in an immutable ledger.

## Callers
- `PosService` (Revenue & COGS)
- `PayrollService` (Salaries & Advance Recovery)
- `AdvanceService` (Advance Issuance & Repayments)
- `VendorPaymentService` (Payables settlements)
- `OperationsService` (Wastage logging)
- `ClosureService` (End-of-period adjustments)

## Method Breakdown

### `createJournalEntry(entryData, client = null)`
- **Steps**:
    1. Instantiates or validates the `JournalEntry` domain object (enforces balance and structural rules).
    2. Validates that all provided `account_code` values exist in the `chart_of_accounts`.
    3. Inserts the header into `journal_entries`.
    4. Iterates through lines and inserts into `ledger_lines`.
- **Transactions**: Supports external transaction clients for cross-service atomicity. Defaults to its own transaction if no client is provided.
- **Rollback**: Rollback occurs if any account validation fails or if database constraints (e.g., non-existent account) are violated.

### `getAccountBalance(accountCode, asOfDate = null)`
- **Steps**:
    1. Sums all debits minus credits for the specific account.
    2. Adjusts the sign based on the `account_type` (Assets/Expenses are Dr-positive, Liabilities/Revenue are Cr-positive).
- **Failure Modes**: Throws error if the account code does not exist.

### `reverseJournalEntry(jeId, reason, reversalDate)`
- **Steps**:
    1. Fetches the original journal entry and its lines.
    2. Creates a new entry with the same lines but swapped `debit` and `credit` values.
    3. Appends "REVERSAL" and the reason to the description.
- **Side Effects**: Creates a link between the original and reversal entry via the `reference_id`.

## Transactions & Rollback Behavior
- **Atomicity**: The service wraps header and line insertions in a single transaction block.
- **Isolation**: Uses standard PostgreSQL transaction isolation to prevent partial ledger updates.

## Failure Modes
- **Imbalance**: The `JournalEntry` domain entity will throw an error before the service starts the database transaction if `totalDebits !== totalCredits`.
- **Missing Account**: Explicitly checked before header insertion.

## Side Effects
- Updates the real-time calculated balances shown in financial reports.
- Triggers database triggers (if any) that might update cached balances.
