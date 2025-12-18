MODULE: Shared Services

SERVICES:
- JournalService
- InventoryService
- PaymentModeService

RULES:
- JournalService accepts DOMAIN objects only
- InventoryService produces InventoryMovements
- PaymentModeService maps modes to GL accounts

FORBIDDEN:
- Business rules inside repositories
- Cross-module SQL joins without service orchestration

EXPECTED BEHAVIOR:
- Services coordinate, not decide rules
- Domain enforces correctness
