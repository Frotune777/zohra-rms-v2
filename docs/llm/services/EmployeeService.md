# EmployeeService

## Purpose
The `EmployeeService` handles the core lifecycle of employees, including profiles, historical changes, and high-level reporting data used by the Payroll module.

## Callers
- `EmployeesController` (CRUD operations)
- `PayrollService` (Data provision)

## Method Breakdown

### `createEmployee(data, userId)` / `updateEmployee(id, data, userId)`
- **Steps**:
    1. Upserts the record in `employees`.
    2. Logs the change details in `employee_history` for audit trails.
- **Transactions**: Atomic; ensures history is always captured.

### `getMonthlyPayrollData(month, year)` / `getEmployeesWithAdvances()`
- **Steps**: Executes optimized JOIN queries to provide a snapshot of employees with their current salary settings and outstanding advance balances.

## Transactions & Rollback Behavior
- **Audit Integrity**: Fails the primary update if the history logging fails.

## Side Effects
- Audit logging in `employee_history`.
- Provides the foundational data for all HR-related financial calculations.
