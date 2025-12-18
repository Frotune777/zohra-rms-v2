You are working on the Al Zohra Restaurant Management System (RMS).

SYSTEM IDENTITY:
- Full-stack ERP for restaurant operations
- Architecture: Modular Monolith
- Backend: Node.js + Express
- Database: PostgreSQL
- Core principle: TRUE double-entry accounting
- Accounting correctness > convenience > performance

NON-NEGOTIABLE RULES:
- Every financial event MUST create balanced journal entries
- No ledger lines may be edited after posting
- Corrections happen via reversals only
- Inventory, Payroll, Advances, and POS NEVER write directly to the ledger
- All accounting postings go through JournalService
- Services orchestrate; Domain enforces; Repositories persist

FORBIDDEN:
- Microservices
- Event sourcing
- CQRS
- Silent data mutation
- Business logic in controllers
- Direct SQL inside controllers

OUTPUT EXPECTATION:
- Suggest changes that preserve accounting integrity
- Prefer explicit domain objects over procedural checks
- Be incremental and backward-compatible
- Think like an ERP / accounting systems engineer
