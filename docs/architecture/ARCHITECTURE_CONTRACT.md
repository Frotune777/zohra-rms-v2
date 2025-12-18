# ARCHITECTURE_CONTRACT.md

## 1. System Pattern
- **Modular Monolith**: Each business domain (Auth, Finance, Inventory, etc.) is encapsulated in a dedicated module under `server/src/modules/`.
- **Decoupling**: Modules interact via services, not direct controller-to-controller calls.

## 2. Layered Responsibility
- **Controllers**: Thin entry points. Responsibility is limited to Request/Response handling. NO business logic. NO raw SQL.
- **Services**: Coordinate business processes and manage transactions. Use Domain Entities for validation.
- **Domain Entities**: Enforce business invariants (e.g., balanced journals, valid stock levels) before data persistence.
- **Data Access**: All SQL must reside in the service or a dedicated repository layer (where applicable).

## 3. Financial Integrity
- **Double-Entry Engine**: Every financial transaction MUST result in a balanced journal entry via `JournalService`.
- **Immutability**: Physical deletion of ledger records is PROHIBITED. Correction is via Reversal.
- **Period Locking**: Systems MUST respect financial period locks to prevent backdating into finalized periods.

## 4. Operational Guardrails
- **Inventory Continuity**: All stock changes MUST be logged in the movements history.
- **Audit Trails**: Every state-changing operation MUST be attributed to a user.
- **FIFO Recovery**: Advance recovery from payroll follows a strict First-In-First-Out rule.

## 5. Coding Standards
- **Error Handling**: Standardized error responses via global middleware.
- **Transactionality**: All multi-step service operations MUST be wrapped in a database transaction.
- **Type Safety**: Use domain entities to ensure numeric values are valid and objects are structurally sound before database insertion.
