MODULE: Finance (Core Backbone)

RESPONSIBILITIES:
- Chart of Accounts (COA)
- Journal Entries & Ledger Lines
- Accounting Periods & Locking
- Trial Balance, P&L, Balance Sheet

DOMAIN OBJECTS:
- JournalEntry (must always be balanced)
- LedgerLine (debit OR credit, never both)
- AccountingPeriod (open / closed)
- Money (currency-safe arithmetic)

RULES:
- JournalEntry constructor MUST enforce balance
- Posted entries are immutable
- Period-locked entries cannot be modified or reversed
- All other modules post accounting events via JournalService only

ALLOWED INTERACTIONS:
- Accept domain objects from other modules
- Persist via repositories
- Expose read-only financial reports

FORBIDDEN:
- Accept raw debit/credit objects
- Allow editing of ledger lines
- Allow backdated posting in closed periods

EXPECTED BEHAVIOR:
- Reject invalid or unbalanced entries
- Support reversals as first-class operations
