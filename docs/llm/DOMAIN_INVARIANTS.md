# DOMAIN_INVARIANTS.md

## Financial Invariants (Accounting)

1. **Balanced Books**: The fundamental rule of the system. Every `journal_entry` MUST be balanced.
    - **Total Debits = Total Credits**.
    - **Enforcement**: Mandatory check in the `JournalEntry` domain entity and `JournalService`.
2. **Double-Sided Posting**: Every transaction must involve at least two distinct account lines.
3. **Immutability of the Ledger**: Posted `ledger_lines` MUST NOT be edited or deleted.
    - **Correction**: Errors are corrected ONLY via reversal journal entries.
4. **Account Validity**: Transactions only allowed on accounts existing in the `chart_of_accounts`.
5. **Period Lock**: No financial postings allowed to a date within a `locked` financial period.
    - **Enforcement**: Standardized check in `JournalService` (via `get_period_status` DB function).

## Inventory Invariants

1. **Physical Traceability**: Every change in `inventory_items.stock_qty` MUST have a corresponding record in `stock_movements`.
    - **Enforcement**: Service layer encapsulation in `InventoryService.adjustStock`.
2. **Append-Only Movement**: Historical stock movements are never modified.
3. **Positive Costing**: `unit_cost` for inventory items should be non-negative.

## HR & Payroll Invariants

1. **Advance Balance Integrity**: Employees cannot have a negative advance balance (Repayments cannot exceed the total sum of Advances issued).
    - **Enforcement**: Explicit balance check in `AdvanceService` and `PayrollService`.
2. **Payroll Continuity**: An employee cannot have more than one 'Paid' payroll record for the same month and year.
3. **Authorized Payout**: Payroll cannot be marked 'Paid' unless it has first achieved the 'Approved' status.

## General System Invariants

1. **Audit Attribution**: All destructive or financial operations MUST capture the ID of the user performing the action (`created_by`, `performed_by`).
2. **Reference Integrity**: All journal entries must be linked to a source document (`reference_id`, `reference_type`).
