# POS Sale Flow

## Trigger
- User clicks "Place Order" in the POS frontend interface.

## Sequential Steps
1. **Validation**: Frontend sends order items and payment method. Backend (POS Service) validates menu item IDs and calculates totals.
2. **Order Creation**: Record is inserted into `orders`.
3. **Item Processing**: For each item:
    - Inserted into `order_items`.
    - Ingredients resolved via `recipe_ingredients`.
    - For each ingredient, `inventory_items.stock_qty` is reduced and an entry is added to `inventory_transactions`.
4. **COGS Aggregation**: Total cost of all ingredients is calculated.
5. **Revenue Journaling**: `JournalService` creates a balanced entry:
    - **Dr**: Cash/Bank account (resolved via `PaymentModeService`).
    - **Cr**: Revenue account (4000).
    - **Cr**: Tax Payable account (2000).
6. **COGS Journaling**: `JournalService` creates a second balanced entry:
    - **Dr**: COGS (5000).
    - **Cr**: Inventory Asset (1200).

## Accounting Entries (Summary)
| Account | Dr | Cr | Description |
| :--- | :--- | :--- | :--- |
| **Cash/Bank** | ₹Total | - | Payment received |
| **Revenue** | - | ₹Net | Order total excluding tax |
| **Tax Payable** | - | ₹Tax | Calculated tax amount |
| **COGS** | ₹Cost | - | Cost of ingredients used |
| **Inventory Asset** | - | ₹Cost | Value reduction in stock |

## Inventory Impact
- Physical stock levels in `inventory_items` are immediately reduced.
- Movement is tracked in `inventory_transactions`.

## Rollback Rules
- If any step fails (e.g., inventory deduction fails, or journal is imbalanced), the entire transaction is rolled back. No order is created, and stock levels remain unchanged.
