MODULE: Point of Sale (POS)

RESPONSIBILITIES:
- Menu management
- Order lifecycle (open → paid → completed)
- Payment modes (cash, card, UPI, split payments)

ACCOUNTING IMPACT:
On order completion:
1. Debit Cash/Bank
2. Credit Revenue
3. Debit COGS
4. Credit Inventory Asset

RULES:
- POS never writes directly to ledger or inventory
- POS constructs JournalEntry domain objects only
- Split payments must create multiple debit lines
- Voids and refunds must be explicitly handled

FORBIDDEN:
- Manual ledger posting
- Inventory deduction without accounting entry
- Editing completed orders

EXPECTED BEHAVIOR:
- Order completion is transactional
- Failure rolls back inventory and accounting
