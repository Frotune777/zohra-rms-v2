# Al Zohra RMS - Project Overview & Technical Guide

This document provides a comprehensive technical overview of the Al Zohra Restaurant Management System (RMS), designed for LLMs and developers to understand the project structure, logic, and architecture.

## 1. Project Summary
Al Zohra RMS is a full-stack ERP-style application tailored for restaurant operations. It manages everything from Point of Sale (POS) and Inventory to complex Financial Accounting and HR/Payroll.

## 2. Technology Stack
- **Frontend**: React (SPD), Vite, Tailwind CSS, Recharts (for visualization), React Router.
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL (Relational).
- **Security**: JWT Authentication, Bcrypt password hashing, Helmet, Rate-limiting, CORS.
- **Deployment**: Docker-ready (Separate containers for DB and App).

## 3. Architecture Overview
The project follows a **Modular Monolith** pattern on the backend, where each functional area is encapsulated in its own directory under `server/src/modules/`.

### Backend Structure:
- `server/server.js`: Entry point.
- `server/src/app.js`: Express app configuration and middleware.
- `server/src/modules/`: Business modules.
    - `finance/`: Core accounting logic.
    - `pos/`: Order and menu management.
    - `inventory/`: Stock tracking and "Chicken Biller" logic.
    - `employees/`: HR, Attendance, Advances, and Payroll.
    - `vendors/`: Supplier management and payments.

### Frontend Structure:
- `client/src/pages/`: Main GUI views.
- `client/src/components/`: Reusable UI components.
- `client/src/services/`: API client abstractions.

## 4. Core Business Logic & Modules

### A. Financial Accounting (The Backbone)
The system implements a **Double-Entry Accounting** system.
- **Chart of Accounts (COA)**: Standardized accounts (Asset, Liability, Equity, Revenue, Expense).
- **Journal Entries**: Every financial event (Sale, Purchase, Expense, Payroll) creates a Header (`journal_entries`) and multiple Lines (`ledger_lines`).
- **JournalService**: Centralized service to ensure debits and credits always balance.
- **Period locking**: Prevents modifying data in closed financial periods.

### B. Inventory & Chicken Biller
- **Chicken Biller**: A specialized module for managing poultry deliveries, daily rates, and variance analysis.
- **Stock Tracking**: Automated inventory deduction when a POS order is placed, using recipe-based ingredient mapping.
- **Wastage**: Logging wastage updates inventory and creates an expense journal entry.

### C. HR & Payroll
- **Advance Approval Workflow**: Multi-step process (Request -> Approval/Rejection -> Ledger Post).
- **Payroll**: Automated calculation based on base salary, days worked (attendance), and advance recoveries.
- **Bulk Attendance**: High-speed attendance marking for staff.

### D. Point of Sale (POS)
- **Menu Management**: Categories, Items, and Rates.
- **Active Orders**: Real-time order creation.
- **Financial Integration**: Completing an order automatically:
    1. Records Revenue (Debit Cash/Bank, Credit Revenue).
    2. Records COGS (Debit COGS, Credit Inventory Asset).
    3. Deducts Inventory stock.

## 5. Database Schema Key Entities
- `employees`: Staff profiles.
- `advance_ledger`: History of employee advances and recoveries.
- `salary_history`: Processed payroll records.
- `inventory_items`: Goods in stock.
- `vendors`: Suppliers.
- `orders`: POS transactions.
- `journal_entries` / `ledger_lines`: The General Ledger.

## 6. Development & Maintenance
- **Migrations**: SQL scripts for schema updates in `server/migrations/`.
- **Seeding**: Initial data for Chart of Accounts and default users in `server/scripts/seed.js`.
- **Testing**: Jest-based unit and integration tests (in progress).

## 7. Key Services to Reference
- `JournalService.js`: Creating balanced accounting entries.
- `PaymentModeService.js`: Mapping payment methods (Cash, Card, UPI) to GL accounts.
- `InventoryService.js`: Managing stock levels and movements.

## 8. Setup & Deployment
- **System Requirements**: Node.js 16+, Docker & Docker Compose.
- **Initialization**: Run `./setup.sh`. This script handles:
    - Environment file creation (`server/.env`, `client/.env`).
    - Dependency installation (`npm install`).
    - Database container startup and schema initialization.
- **Running the App**:
    - **Development (Manual)**: `npm run dev` in both `client` and `server` directories.
    - **Docker (Recommended)**: `docker-compose up` to run the entire stack (Database, Backend, Frontend).
- **Default URLs**:
    - Frontend: `http://localhost:3002`
    - Backend: `http://localhost:5000`
