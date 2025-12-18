# Finance Module

## Responsibilities
- Maintenance of the General Ledger (GL) and Chart of Accounts.
- Execution and validation of double-entry journal entries.
- Period management (locking/unlocking financial periods).
- Daily and monthly financial closure workflows.
- Cash and bank reconciliation.
- Resolution of payment modes to specific GL accounts.

## Folder Structure
- `server/src/modules/finance/`
    - `entities/`: Domain entities for business rule enforcement.
        - `JournalEntry.js`: Invariants for a balanced transaction.
        - `LedgerLine.js`: Invariants for a single account posting.
    - `JournalService.js`: The authoritative service for all ledger modifications.
    - `PaymentModeService.js`: Maps modes (Cash, UPI, Card) to account codes.
    - `ClosureService.js`: Manages the lifecycle of financial periods.
    - `ReconciliationService.js`: Verification of ledger balances against physical/external records.
    - `controller.js`: API handlers for financial reports and operations.
    - `routes.js`: Routes for journals, closure, ledger, and reconciliation.

## DB Tables Used
- `accounts`: Chart of accounts (`code`, `name`, `type`, `balance`).
- `journal_entries`: Transaction headers (`date`, `description`).
- `ledger_lines`: Individual debits/credits linked to journal entries.
- `financial_periods`: Management of lock statuses for time ranges.
- `closures`: Log of daily/monthly closure events and summaries.

## Public Services & Methods
- **JournalService**: `createJournalEntry(journalEntry, client)`, `getLedger(params)`, `getTrialBalance()`.
- **PaymentModeService**: `getAccountCode(paymentMode)`.
- **ClosureService**: `closeDay(date)`, `getPeriodStatus(date)`.
- **ReconciliationService**: `processReconciliation(params)`.

## Core Business Rules
- **Structural Integrity**: Every journal entry MUST have at least two lines and Total Debits MUST equal Total Credits.
- **Immutability**: Once a ledger line is persisted, it cannot be modified or deleted. Corrections must be made via reversal journals (`DR` becomes `CR` and vice versa).
- **Period Integrity**: No journal entries can be posted to a date that falls within a locked financial period.
- **Account Validity**: Transactions can only be posted to active accounts in the Chart of Accounts.

## Accounting Impact
- This module is the final destination for the accounting impact of ALL other modules (POS, Inventory, Payroll).
- It provides the single source of truth for the Trial Balance, P&L, and Balance Sheet.

## Risks / Unclear Logic
- **Manual Journal Entries**: While system-generated journals are robust, manual journals bypass specific module-level guards (like inventory checks).
- **Historical Balance Fixes**: Attempting to fix historical imbalances requires careful use of the reversal pattern to maintain the audit trail.
