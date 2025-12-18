# Inventory Purchase Flow

## Trigger
- User submits a "Chicken Bill Entry" or "Inventory Purchase" form.

## Sequential Steps
1. **Rate Lookup**: Service fetches `daily_rates` for the bill date.
2. **Markup Application**: System retrieves `markup_rules` for the specific supplier and item.
3. **Variance Calculation**: `expected_rate` is calculated (Market Rate + Markup). `variance` = (Vendor Price - Expected Price) * Qty.
4. **Bill Recording**: Record is inserted into `bill_entries` with status 'Pending'.
5. **Inventory Updating**: 
    - System attempts to match `item_name` to an existing `inventory_item`.
    - If matched, `InventoryService.adjustStock` is called (Type: `PURCHASE`).
6. **Vendor Ledger**: A 'Bill' transaction is added to `vendor_ledger` for the full vendor amount.

## Accounting Entries (Summary)
- Most purchases currently impact the `vendor_ledger` which reflects an increase in payables. 
- *Note*: High-level general ledger integration (Asset vs Payable) is currently a manual reconciliation point or handled during vendor payment settlements.

## Inventory Impact
- Physical stock levels in `inventory_items` are increased.
- Movement is logged in `stock_movements`.

## Rollback Rules
- If the vendor ledger update or stock adjustment fails, the bill entry creation is rolled back.
