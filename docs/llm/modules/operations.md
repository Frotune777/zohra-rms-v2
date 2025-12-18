# Operations Module

## Responsibilities
- Logging and tracking of operational wastage.
- Integration of wastage costs into the general ledger.
- Coordination of cross-cutting tasks that impact both inventory and finance.

## Folder Structure
- `server/src/modules/operations/`
    - `OperationsService.js`: (Refactored) Logic for logging wastage with immediate financial journaling.
    - `controller.js`: API handlers for wastage operations.
    - `routes.js`: Routes for wastage logging and logs retrieval.

## DB Tables Used
- `wastage_logs`: Detailed record of wasted items, quantities, reasons, and calculated costs.
- `inventory_items`: Updated to reflect stock reductions.

## Public Services & Methods
- **OperationsService**:
    - `logWastage({ item_id, qty, reason }, reportedBy, client)`: 
        1. Calculates cost based on item's `unit_cost`.
        2. Records the wastage event.
        3. Atomically reduces `inventory_items.stock_qty`.
        4. Triggers balanced journaling.

## Core Business Rules
- **Non-Zero Cost**: Wastage is only journaled if the calculated cost is greater than zero.
- **Attribution**: Every wastage event must be attributed to a reporter and provide a reason for audit purposes.

## Accounting Impact
- **Financial Recording**: Automatically creates a journal entry for every wastage event:
    - **Wastage Expense**: Dr: Account 6000 (General Expense - Wastage), Cr: Account 1200 (Inventory Asset).

## Risks / Unclear Logic
- **Cost Calculation Integrity**: Uses the current `unit_cost` at the moment of logging, which may not reflect the actual purchase price if costs have fluctuated (no WACO/FIFO costing implementation).
