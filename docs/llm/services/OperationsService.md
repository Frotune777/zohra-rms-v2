# OperationsService

## Purpose
The `OperationsService` coordinates cross-cutting operational tasks, primarily focusing on inventory wastage and its corresponding financial impact.

## Callers
- `OperationsController` (Wastage logging)

## Method Breakdown

### `logWastage({ item_id, qty, reason }, reportedBy, client)`
- **Steps**:
    1. Fetches the current `unit_cost` for the item from `inventory_items`.
    2. Calculates total cost (`qty * unit_cost`).
    3. Records the event in `wastage_logs`.
    4. Atomically reduces `inventory_items.stock_qty`.
    5. Triggers `JournalService.createJournalEntry` (Dr: Account 6000 - Wastage Expense, Cr: Account 1200 - Inventory Asset).
- **Transactions**: Atomic; ensuring physical stock reduction and financial loss recording are inseparable.

## Transactions & Rollback Behavior
- **Atomicity**: If either the inventory update or the journal entry fails, the wastage log is NOT persisted.

## Failure Modes
- **Zero Cost**: Skips journaling but still records the log and adjusts stock if the cost is 0.
- **Missing Item**: Throws error.

## Side Effects
- Directly impacts the P&L through immediate expense recognition.
