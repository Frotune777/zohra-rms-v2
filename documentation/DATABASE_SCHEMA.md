# Database Schema Documentation

This document provides a detailed overview of the Al Zohra RMS database schema, including table definitions, relationships, and standalone tables.

## 1. User Management

### `users`
Stores system users for authentication and authorization.
- **Columns**: `id`, `email`, `password_hash`, `full_name`, `role` (staff, manager, owner), `created_at`, `status`.
- **Relationships**:
    - Referenced by `orders.created_by`.
    - Referenced by `bill_entries.approved_by`.
    - Referenced by audit columns `created_by`, `updated_by`.

## 2. Finance (Double-Entry Accounting)

### `chart_of_accounts`
Defines the standard list of accounts for financial tracking.
- **Columns**: `code` (PK), `name`, `type` (Asset, Liability, Revenue, Expense).
- **Relationships**:
    - Referenced by `ledger_lines.account_code`.
    - Referenced by `bank_accounts.account_code`.
    - Referenced by `tax_rates.account_code`.

### `journal_entries`
Records financial transactions.
- **Columns**: `id` (UUID), `transaction_date`, `description`.
- **Relationships**:
    - Parent of `ledger_lines`.
    - Referenced by `vendor_ledger.journal_entry_id`.

### `ledger_lines`
Individual debit/credit lines for a journal entry.
- **Columns**: `id` (UUID), `journal_entry_id` (FK), `account_code` (FK), `debit`, `credit`.
- **Relationships**:
    - Links `journal_entries` to `chart_of_accounts`.

### `bank_accounts`
Stores bank and cash accounts.
- **Columns**: `id`, `name`, `account_number`, `bank_name`, `account_code` (FK), `current_balance`.
- **Relationships**:
    - Linked to `chart_of_accounts`.

### `tax_rates`
Defines tax rates for VAT/GST.
- **Columns**: `id`, `name`, `rate_percentage`, `account_code` (FK), `is_active`.
- **Relationships**:
    - Linked to `chart_of_accounts`.

### `financial_periods`
Tracks accounting periods.
- **Columns**: `id`, `start_date`, `end_date`, `status` (Open/Closed), `locked_by` (FK).

## 3. Inventory & Menu

### `inventory_items`
Stores raw ingredients and stock items.
- **Columns**: `id`, `name`, `stock_qty`, `unit_cost`, `unit`, `audit_fields`.
- **Relationships**:
    - Referenced by `recipe_ingredients.inventory_item_id`.
    - Referenced by `purchase_order_items.inventory_item_id`.
    - Referenced by `wastage_logs.inventory_item_id`.

### `menu_items`
Stores sellable items (dishes, beverages).
- **Columns**: `id`, `name`, `price`, `category`, `audit_fields`.
- **Relationships**:
    - Referenced by `recipe_ingredients.menu_item_id`.
    - Referenced by `order_items.menu_item_id`.

### `recipe_ingredients`
Join table defining the recipe for a menu item.
- **Columns**: `menu_item_id` (FK), `inventory_item_id` (FK), `quantity_required`.

## 4. HR & Payroll

### `employees`
Stores employee details.
- **Columns**: `id`, `full_name`, `employee_code`, `govt_id_type`, `govt_id_number`, `base_salary`, `status`, `visa_expiry`, `work_permit_expiry`, `health_card_expiry`, `shift_id` (FK).
- **Relationships**:
    - Referenced by `salary_advances.employee_id`.
    - Referenced by `employee_salary_structure.employee_id`.
    - Referenced by `employee_documents.employee_id`.

### `salary_advances`
Records salary advances.
- **Columns**: `id`, `employee_id` (FK), `amount`, `balance_remaining`, `status`, `total_repaid`.
- **Relationships**:
    - Belongs to `employees`.
    - Parent of `advance_ledger` entries.

### `advance_ledger`
Tracks ledger history of advances and repayments.
- **Columns**: `id`, `employee_id` (FK), `salary_advance_id` (FK), `transaction_type`, `amount`, `balance_after`, `payment_mode`.

### `salary_components`
Defines earnings and deductions types.
- **Columns**: `id`, `name`, `type` (Earning/Deduction), `is_taxable`.

### `employee_salary_structure`
Maps salary components to employees.
- **Columns**: `id`, `employee_id` (FK), `component_id` (FK), `amount`.

### `employee_documents`
Stores details of uploaded employee documents.
- **Columns**: `id`, `employee_id` (FK), `document_type`, `expiry_date`, `file_path`.

### `shifts`
Defines work shifts.
- **Columns**: `id`, `name`, `start_time`, `end_time`.

## 5. Supplier & Vendor Management

### `suppliers`
Stores profiles for vendors and suppliers.
- **Columns**: `id`, `name`, `vendor_type`, `payment_type`, `markup_required`, `audit_fields`.
- **Relationships**:
    - Referenced by `supplier_items.supplier_id`.
    - Referenced by `bill_entries.supplier_id`.

### `supplier_items`
Master list of items provided by specific suppliers.
- **Columns**: `id`, `supplier_id` (FK), `item_name`, `default_price`.

### `bill_entries`
Records daily bills received from suppliers.
- **Columns**: `id`, `date`, `supplier_id` (FK), `item_name`, `qty`, `status`, `approved_by` (FK), `approved_at`, `approval_notes`.

### `vendor_ledger`
Financial ledger for vendor payments and bills.
- **Columns**: `id`, `date`, `supplier_id` (FK), `transaction_type`, `amount`, `journal_entry_id` (FK).

## 6. Operations (Customers, Orders, POS)

## 6. System & Audit (New)

### `audit_logs`
- **Columns**: `id`, `table_name`, `record_id`, `action`, `old_data` (JSON), `new_data` (JSON), `changed_at`.

### `financial_periods`
Tracks accounting periods with locking capability.
- **Columns**: `id`, `name` (Jan 2025), `start_date`, `end_date`, `status` (Open/Closed), `locked_by` (FK), `locked_at`.
- **Enhancements**: Auto-generated periods, database-level locking enforcement.

## 7. Accounting System (Phase 7)

### `payment_modes`
Configures payment methods and their GL account routing.
- **Columns**: `id`, `name`, `account_code` (FK), `is_active`, `description`.
- **Relationships**:
    - Links to `chart_of_accounts` for account routing.
    - Referenced by transactions for payment method tracking.

### `daily_closures`
Tracks daily business day opening and closing.
- **Columns**: `id`, `date`, `status` (Open/Closed/Reopened), `opening_cash`, `expected_cash`, `actual_cash`, `variance`, `journal_entry_id` (FK), `opened_by`, `closed_by`, `opening_notes`, `closing_notes`.
- **Relationships**:
    - Links to `journal_entries` for variance posting.
    - Enforces day-level transaction locking.

### Enhanced `categories`
Expense categories with GL account mapping.
- **New Columns**: `account_code` (FK) - Links expense categories to chart of accounts.
- **Purpose**: Auto-routes expenses to correct GL accounts.

### Enhanced `advance_ledger`
Advance ledger with journal entry tracking.
- **New Columns**: `journal_entry_id` (FK) - Links advance transactions to journal entries.
- **Purpose**: Ensures all advance transactions are properly journalized.

## 8. Database Functions

### `get_period_status(date)`
Returns the status of the financial period for a given date.
- **Returns**: 'Open', 'Closed', or 'Not Found'
- **Usage**: Validates if transactions can be posted to a period.

### `validate_day_closure(date)`
Validates if a day can be edited based on closure status.
- **Returns**: Boolean
- **Usage**: Enforces day closure constraints.

## 9. Database Triggers

### `enforce_period_lock`
Prevents insertion/update of journal entries in locked periods.
- **Table**: `journal_entries`
- **Event**: BEFORE INSERT OR UPDATE
- **Action**: Raises exception if period is locked.

## Standalone Tables & Reference Data

1.  **`users`**: Only referenced by others.
2.  **`chart_of_accounts`**: Reference dictionary.
3.  **`daily_rates`**: Time-series data table.
4.  **`salary_components`**: Reference dictionary.
5.  **`shifts`**: Reference dictionary.
6.  **`payment_modes`**: Reference dictionary for payment methods.

## Summary of Improvements

- **Finance Integration**: `vendor_ledger` now links to `journal_entries`. Added `bank_accounts` and `tax_rates`.
- **Audit Trails**: Added `created_by`, `updated_by`, `updated_at` to master tables.
- **HR Compliance**: Added `employee_documents`, `shifts`, and granular `salary_components`.
- **Operations**: Added `customers` and `supplier_items` masters.
- **Accounting System (Phase 7)**:
  - **Complete Double-Entry**: All transactions create balanced journal entries
  - **Day Closure**: Daily cash reconciliation with variance tracking
  - **Period Locking**: Database-enforced protection against editing closed periods
  - **Payment Mode Routing**: Configurable GL account mapping for payment methods
  - **Zero Duplication**: Single source of truth via journal entries
