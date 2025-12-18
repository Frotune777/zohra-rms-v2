MODULE: Inventory

RESPONSIBILITIES:
- Stock levels
- Purchases & consumption
- Wastage tracking
- Chicken Biller logic

DOMAIN OBJECTS:
- InventoryItem
- InventoryMovement
- StockQuantity

RULES:
- Inventory movements are append-only
- Stock balance is derived, not mutated
- Every financial inventory event creates journal entries

ACCOUNTING IMPACT:
- Purchase → Inventory Asset ↑
- Sale → Inventory Asset ↓ + COGS ↑
- Wastage → Inventory Asset ↓ + Expense ↑

FORBIDDEN:
- Direct stock updates without movement records
- Negative stock without explicit override
- Silent rate changes

EXPECTED BEHAVIOR:
- Full stock audit trail
- Costing method must be explicit (Weighted Avg / FIFO)
