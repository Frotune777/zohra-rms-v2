# Inventory Module

## Responsibilities
- Real-time tracking of physical stock quantities.
- Management of master inventory items and unit costs.
- Recording of daily market rates (Chicken/Eggs) to drive dynamic pricing logic.
- Definition of supplier-specific markup rules.
- Processing of bill entries (purchases) with automatic stock updates and vendor ledger integration.

## Folder Structure
- `server/src/modules/inventory/`
    - `service.js`: Comprehensive service for items, rates, markups, and bill processing.
    - `controller.js`: Orchestrates inventory and rate-related requests.
    - `po.controller.js`: Manages Purchase Order specific logic.
    - `routes.js`: Defines API endpoints for all inventory actions.

## DB Tables Used
- `inventory_items`: Master list of stock items and current levels.
- `stock_movements`: Append-only log of all quantity changes (`ADJ_IN`, `ADJ_OUT`, `PURCHASE`, `SALE`, `WASTAGE`).
- `daily_rates`: Market rates for key commodities indices.
- `suppliers`: Vendor registry with payment and markup settings.
- `markup_rules`: Logic for calculating expected rates based on market indices.
- `bill_entries`: Record of individual purchases and their variance from expected rates.

## Public Services & Methods
- **InventoryService**:
    - `addItem(data, userId)`: Creates item and logs initial stock.
    - `adjustStock(itemId, quantityChange, type, details, userId)`: Atomically updates stock and logs movement.
    - `saveDailyRates(data)`: Persists market rates and updates status.
    - `createBillEntry(data, userId)`: Complex method that:
        1. Calculates expected rate via rules.
        2. Records the bill.
        3. Updates physical stock (if item exists).
        4. Updates vendor ledger.

## Core Business Rules
- **Append-Only History**: Stock levels must never be changed without a corresponding entry in `stock_movements`.
- **Market-Driven Purchasing**: Purchase variance is tracked against dynamic daily rates to monitor supplier performance.
- **Negative Stock**: While the system identifies stock depletion, it typically allows "Sale" or "Wastage" to proceed for operational continuity, with the responsibility on the user to reconcile.

## Accounting Impact
- **Purchases**: Recorded in `vendor_ledger` as 'Bill' transactions. Note: Direct general ledger integration for purchases is currently handled through `vendor_ledger` and `vendor_payments` (see Vendors module).
- **Stock Value**: Changes in `inventory_items` and `unit_cost` impact the theoretical asset value reporting.

## Risks / Unclear Logic
- **Loose Item Matching**: Bill entries match inventory items by name (CI search), which may lead to missed stock updates if names are slightly inconsistent.
- **Manual Adjustments**: `updateItem` calculates a 'Manual Adjustment' movement, which may mask underlying operational issues if overused.
