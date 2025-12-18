# Al Zohra RMS – System Snapshot

## Purpose
Full-stack restaurant ERP with accounting at the core.

## Architecture
- Modular monolith
- Node.js + Express
- PostgreSQL
- Domain-driven accounting core

## Non-Negotiable Invariants
1. Double-entry accounting
2. JournalService is the only posting mechanism
3. Ledger immutability
4. Inventory movements are append-only
5. Payroll and accounting periods are lockable

## High-Risk Areas
- POS → Inventory → Accounting
- Payroll posting
- Advances recovery
- Chicken Biller rate variance

## Current Gaps / TODOs
- Refunds not implemented
- Bank reconciliation pending
