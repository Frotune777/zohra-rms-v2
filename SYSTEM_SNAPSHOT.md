# SYSTEM_SNAPSHOT.md

## Purpose
The Al Zohra Restaurant Management System (RMS) is a comprehensive ERP solution tailored for restaurant operations. It integrates Point of Sale (POS), Inventory Management, Human Resources, Payroll, and sophisticated Double-Entry Accounting into a unified platform.

## Architecture
- **Pattern**: Modular Monolith.
- **Backend**: Node.js with Express.js.
- **Database**: PostgreSQL.
- **Frontend**: React.
- **Service Layer**: Business logic is encapsulated in dedicated services (e.g., `JournalService`, `InventoryService`), which are consumed by controllers.
- **Domain Layer**: Core business rules are enforced by domain entities (e.g., `JournalEntry`, `LedgerLine`) to ensure structural and financial integrity before persistence.

## Non-negotiable Invariants
1. **Balanced Accounting**: Every financial transaction MUST be balanced (Total Debits = Total Credits). This is enforced by the `JournalEntry` domain entity.
2. **Single Entry Point**: `JournalService.createJournalEntry` is the ONLY authorized method for modifying the financial ledger.
3. **Immutability**:
    - **Ledger**: Posted ledger lines are immutable. Errors must be corrected through reversal journal entries.
    - **Inventory**: Stock movements are append-only.
4. **Period Locking**: Financial periods can be locked to prevent any modifications to past data.
5. **Decoupled Business Logic**: Controllers MUST NOT contain raw SQL or complex business/accounting logic; they must delegate to services.

## Key Modules
- **Finance**: The core ledger and journal management system.
- **POS**: Handles sales, menu management, and real-time revenue journaling.
- **Inventory**: Tracks stock, wastage, and purchases with direct integration into the finance module.
- **HR & Payroll**: Manages employee data, attendance, and automated salary processing with integrated accounting.
- **Vendors**: Manages supplier relationships, bills, and payments.

## High-Risk Areas
- **Accounting Imbalance**: Any bypass of the `JournalEntry` domain validation poses a risk to financial integrity.
- **Race Conditions**: Concurrent stock updates or payroll runs require careful transaction management.
- **Data Integrity**: Direct database manipulations outside the service layer are strictly forbidden as they bypass domain invariants.

## Known Gaps
- **Legacy Tests**: Many existing unit tests rely on outdated mock sequences that do not reflect the current service-oriented, multi-query accounting flows.
- **Manual Reconciliation**: Some edge cases in inventory-to-finance mapping may still require manual verification.
