# Vendors & Payables Module

## Responsibilities
- Management of supplier profiles and categories.
- Recording and tracking of vendor bills (linked to Inventory).
- Processing of vendor payments with automated financial journaling.
- Maintenance of vendor-specific ledgers and outstanding balances.
- Generation of aging reports and payment history summaries.

## Folder Structure
- `server/src/modules/vendors/`
    - `VendorPaymentService.js`: Core service for processing payments and fetching vendor details.
    - `ledger.service.js`: Analytical service for running balances, aging, and aggregations.
    - `payments.controller.js`: Thin controller delegating to services.
    - `routes.js`: Defines API endpoints for all vendor-related actions.

## DB Tables Used
- `suppliers`: Registry of all vendors (`name`, `opening_balance`).
- `vendor_categories`: Classification of vendors.
- `vendor_payments`: Log of all payments made to vendors (`amount`, `mode`, `journal_entry_id`).
- `vendor_ledger`: Central transactional table for bills and payments per vendor.
- `vendor_outstanding`: PostgreSQL View/Table tracking real-time balances and summary stats.

## Public Services & Methods
- **VendorPaymentService**:
    - `processPayment({ vendorId, amount, paymentMode, ... })`: Validates balance, inserts payment, updates ledger, and triggers balanced journaling.
    - `getVendorDetails(id)`: Returns comprehensive vendor info including aging data.
- **ledger.service**:
    - `calculateRunningBalance(vendorId, ...)`: Returns a chronological list of transactions with a calculated running balance.
    - `getAgingReport()`: Categorizes outstanding amounts into 0-30, 30-60, 60-90, and >90 days.
    - `getCategoryAggregation()`: Aggregates balances and transaction volume by vendor category.

## Core Business Rules
- **Balance Validation**: Payment amounts cannot exceed the current outstanding balance for a vendor.
- **Double-Entry Alignment**: Every payment must result in a balanced journal entry (Dr: Vendor Payable, Cr: Cash/Bank).
- **Immutable History**: Historical transactions in `vendor_ledger` are used to derive the current balance; modifications require reversal patterns.

## Accounting Impact
- **Bills (Purchases)**: Recorded as 'Bill' type in `vendor_ledger`. High-level accounting impact (Inventory Asset vs Payable) is currently coordinated through the Inventory/Vendor nexus.
- **Payments**: 
    - Dr: Account 2000 (Vendor Payable)
    - Cr: Resolved Account (Cash/Bank/UPI)

## Risks / Unclear Logic
- **Historical Corrections**: Direct modification of `opening_balance` in the `suppliers` table will shift the entire running balance for all subsequent periods.
- **Variance Tracking**: While bill entries track variance from market rates (see Inventory), this module focuses on the absolute payable amount recorded in the ledger.
