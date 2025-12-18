# InventoryService

## Purpose
The `InventoryService` manages the physical and analytical aspects of the restaurant's supply chain. It tracks stock levels, monitors market price volatility, and coordinates purchase records with the vendor ledger.

## Callers
- `InventoryController` (Master data & manual adjustments)
- `ChickenController` (Daily rates & Bill entries)
- `PosService` (Stock deduction for sales)
- `OperationsService` (Wastage logging)

## Method Breakdown

### `addItem(data, userId)` / `updateItem(id, data, userId)`
- **Steps**:
    1. Upserts the item record in `inventory_items`.
    2. Calculates the quantity difference.
    3. Logs a 'Manual Adjustment' (`ADJ_IN` or `ADJ_OUT`) in `stock_movements`.
- **Transactions**: Atomic; rolls back item update if movement logging fails.

### `adjustStock(itemId, quantityChange, type, details, userId)`
- **Steps**:
    1. Updates `inventory_items.stock_qty`.
    2. Inserts a record into `stock_movements` with the specified `type` (e.g., `PURCHASE`, `WASTAGE`).
- **Rollback**: Standard transactional rollback.

### `saveDailyRates(data)`
- **Steps**:
    1. Inserts or updates market rates for a specific date in `daily_rates`.
    2. Automatically sets status to 'confirmed' if all three key rates (Tandoor, Boiler, Egg) are present.

### `createBillEntry(data, userId)`
- **Steps**:
    1. Validates that `daily_rates` exist for the bill date.
    2. Resolves `markup_rules` for the supplier/item.
    3. Calculates `expected_rate` and `variance`.
    4. Records the bill in `bill_entries`.
    5. Attempts to match the bill item to an `inventory_item` (case-insensitive) and calls `adjustStock`.
    6. Inserts a 'Bill' record into `vendor_ledger` for the total amount.
- **Side Effects**: Simultaneously updates inventory levels and vendor debt.

## Transactions & Rollback Behavior
- **Bill Entry Atomicity**: If stock adjustment or ledger insertion fails, the entire bill entry is rolled back.
- **Concurrency**: Relies on default Postgres isolation for stock updates.

## Failure Modes
- **Missing Rates**: Rejects bill entry creation if market rates for that date have not been set.
- **Rule Not Found**: Defaults `expected_rate` to 0 if no markup rule exists (marking the entire amount as variance).

## Side Effects
- Updates `vendor_outstanding` views/tables.
- Affects `COGS` calculation in the POS module by providing updated `unit_cost`.
