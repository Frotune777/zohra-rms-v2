MODULE: Vendors & Payables

RESPONSIBILITIES:
- Supplier management
- Purchases
- Vendor payments
- Outstanding balances

DOMAIN OBJECTS:
- Vendor
- VendorInvoice
- VendorPayment

RULES:
- Purchases create liabilities
- Payments reduce liabilities
- Partial payments must be supported

ACCOUNTING IMPACT:
- Purchase → Inventory/Expense + Payable
- Payment → Payable ↓ + Cash/Bank ↓

FORBIDDEN:
- Paying without liability
- Editing posted invoices
- Bypassing JournalService

EXPECTED BEHAVIOR:
- Accurate vendor aging
- Clear payable reconciliation
