# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2025-12-08

### Added
- **Employee Management Enhancements**:
    - Auto-generated Employee IDs (e.g., EMP001).
    - Government ID tracking (Type and Number).
    - Explicit separation of System Role (Staff/Manager/Owner) and Job Designation.
- **Advance Ledger Upgrades**:
    - Added `Payment Mode` (Cash, UPI, Bank Transfer) tracking.
    - Added `Paid By` field to track who authorized/paid the advance.
    - New Reporting Section in Advance Ledger showing cumulative totals by Payer and Mode.
- **Financial Integration**:
    - Salary Advances paid by Cash are now automatically deducted from the **Daily Cash Flow** summary.
- **Dashboard**:
    - Daily Summary now includes a dedicated "Salary Advances" outflow line item.

### Fixed
- Fixed "Failed to load data" error in Advance Ledger by adding robust error handling and token checks.
- Fixed duplicate variable declaration bug in Finance Controller.
- Fixed Employee ID generation logic to use `MAX(id)` for reliability.

## [2.0.0] - 2025-12-01

### Added
- **Full Stack Migration**: Rebuilt entire application using React (Vite) and Node.js (Express).
- **Chicken Tracker Module**:
    - Daily Rate management for Tandoor, Boiler, and Egg.
    - Vendor Bill Entry with automatic markup calculations.
    - Variance analysis reports.
- **HR & Payroll**:
    - Comprehensive Employee Profiles.
    - Salary History Tracking.
    - Monthly Payroll Processing with manual adjustments.
- **Finance**:
    - Double-Entry Ledger System.
    - Daily Financial Summary (Sales, Expenses, Net Cash Flow).
- **POS**:
    - Real-time cart management.
    - Integrated with Inventory and Finance.
- **Security**:
    - JWT Authentication.
    - Role-Based Access Control (RBAC).

### Removed
- Legacy Streamlit application code.
