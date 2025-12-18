# Inventory Wastage Flow

## Trigger
- User logs a wastage event in the Operations/Inventory module.

## Sequential Steps
1. **Cost Retrieval**: System fetches the current `unit_cost` for the item from `inventory_items`.
2. **Log Creation**: Wastage event is recorded in `wastage_logs`.
3. **Stock Reduction**: `inventory_items.stock_qty` is decreased for the specified item.
4. **Financial Journaling**: `JournalService` creates a balanced entry:
    - **Dr**: General Expense - Wastage (6000).
    - **Cr**: Inventory Asset (1200).

## Accounting Entries (Summary)
| Account | Dr | Cr | Description |
| :--- | :--- | :--- | :--- |
| **Wastage Expense** | ₹Value | - | Value of wasted stock |
| **Inventory Asset** | - | ₹Value | Asset reduction |

## Inventory Impact
- Immediate reduction in `inventory_items.stock_qty`.
- Tracked via `stock_movements` (Type: `WASTAGE`).

## Rollback Rules
- Full transactional atomicity: failure in any step reverts stock changes and log entry.
