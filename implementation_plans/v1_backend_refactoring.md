# Implementation Plan - Backend Refactoring (Phase 1)

**Version**: v1.0
**Date**: 2025-12-08
**Task**: Backend Modularization & Architecture Upgrade

## Goal
Refactor the existing monolithic `server.js` into a maintainable, modular architecture to support future enterprise features (RBAC, Multi-branch, Advanced Analytics).

## User Review Required
> [!IMPORTANT]
> This is a major refactor. While API endpoints will remain compatible, the internal file structure will change completely.
> - **Backup**: Ensure database is backed up before applying schema changes.
> - **Downtime**: Brief downtime required during deployment of new server structure.

## Proposed Architecture
We will move from a "Route-Controller" split to a **Domain-Module** structure.

```
server/
├── src/
│   ├── config/         # DB, Env, Constants
│   ├── middleware/     # Auth, RBAC, Logging
│   ├── modules/        # Feature Modules
│   │   ├── auth/       # Login, Register, Profile
│   │   ├── inventory/  # Items, Stock, Recipes
│   │   ├── finance/    # Ledger, P&L, Transactions
│   │   ├── employees/  # HR, Payroll, Attendance
│   │   └── pos/        # Menu, Orders, KDS
│   ├── shared/         # Shared utilities, Helpers
│   └── app.js          # App entry point (Express setup)
└── server.js           # Server entry point (Port listener)
```

## Proposed Changes

### 1. Infrastructure Setup
#### [NEW] `src/app.js`
- Separate Express app setup from port listening for easier testing.
- Centralized error handling middleware.

#### [NEW] `src/middleware/rbac.js`
- Implement granular permission checking (e.g., `checkPermission('inventory:edit')`).

### 2. Module Migration
For each module (Auth, Inventory, Finance, Employees, POS), we will create:
- `routes.js`: Express router definitions.
- `controller.js`: Request handling and validation.
- `service.js`: Business logic and database interaction.

#### [MODIFY] `server.js`
- Remove all inline route logic.
- Import and use the new `app.js`.

### 3. Database Schema Updates
#### [NEW] `audit_logs` table
- Track changes to critical data.
```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT,
    action VARCHAR(50),
    entity VARCHAR(50),
    entity_id INT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Verification Plan

### Automated Tests
- We will verify that all existing API endpoints continue to function correctly using `curl` or Postman-like scripts.
- Specifically test:
    1.  Login/Auth flow.
    2.  Creating an Order (POS).
    3.  Running Payroll.
    4.  Viewing P&L.

### Manual Verification
- Start the server and ensure no startup errors.
- Navigate through the Frontend App to ensure no broken pages.
