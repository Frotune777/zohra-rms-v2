# POS Module

## Responsibilities
- Management of menu items, pricing, and categories.
- Processing of customer orders and sales transactions.
- Automated tax and COGS (Cost of Goods Sold) calculation.
- Real-time communication with the Inventory module for stock deduction.
- Real-time journaling of revenue and COGS into the Finance module.

## Folder Structure
- `server/src/modules/pos/`
    - `service.js`: The central service for menu management and order orchestration.
    - `controller.js`: API handlers for order and menu operations.
    - `routes.js`: Defines API endpoints for POS operations.

## DB Tables Used
- `menu_items`: Registry of all items available for sale.
- `orders`: Transaction headers (`total_amount`, `payment_mode`, `order_number`).
- `order_items`: Line items for each order, including unit prices and tax.
- `recipe_ingredients`: Mapping of menu items to their required inventory items and quantities.
- `payment_transactions`: Record of payments received for each order.
- `inventory_transactions`: Atomic log of inventory changes triggered by sales.
- `customers`: Registry of customer info for order attribution.

## Public Services & Methods
- **PosService**:
    - `getMenu()`: Returns all menu items.
    - `createOrder(data, userId)`: A multi-step transaction that:
        1. Calculates total amount and taxes.
        2. Creates the `orders` and `order_items` records.
        3. Deducts inventory based on `recipe_ingredients`.
        4. Calculates and records `COGS`.
        5. Triggers a Revenue Journal (Dr: Cash/Bank, Cr: Revenue, Cr: Tax Payable).
        6. Triggers a COGS Journal (Dr: COGS, Cr: Inventory Asset).

## Core Business Rules
- **Recipe-Based Deduction**: Sales of menu items automatically reduce stock of raw ingredients according to defined recipes.
- **Inclusive/Exclusive Tax**: Tax rates are resolved per menu item and integrated into the final order total.
- **Order Immutability**: Once an order is 'Completed', its core financial and inventory impact is immediate and reversal requires specific administrative actions.

## Accounting Impact
- **Revenue Recognition**: Every sale immediately credits the Revenue account (4000) and Tax Payable (2000).
- **Cost Matching**: The system immediately recognizes the cost of ingredients (COGS - 5000) and reduces the Inventory Asset (1200) for every sale.

## Risks / Unclear Logic
- **Recipe Accuracy**: If `recipe_ingredients` are outdated or inaccurate, the system will report incorrect COGS and inventory levels.
- **Inventory Transaction Redundancy**: The system logs to both `inventory_transactions` and `inventory_items.stock_qty` (via direct update), which requires tight synchronization within the transaction.
