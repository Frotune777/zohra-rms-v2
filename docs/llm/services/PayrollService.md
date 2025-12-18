# PayrollService

## Purpose
The (Refactored) `PayrollService` provides specialized logic for calculating and journaling payroll for individual employees. It serves as the modern counterpart to the legacy `Payroll` module.

## Callers
- `EmployeesController` (Run individual payroll)

## Method Breakdown

### `runPayroll({ employeeId, month, year, ... }, client)`
- **Steps**:
    1. Fetches employee base salary and proration parameters.
    2. Calculates `earnedSalary` based on `daysWorked / daysInMonth`.
    3. Upserts `salary_history` and deletes/inserts `salary_history_components` for clear breakdown reporting.
    4. Instantiates a `JournalEntry` (Dr: Salaries Expense, Cr: Cash).
    5. Calls `JournalService.createJournalEntry`.
- **Transactions**: Designed to be called within a parent transaction.
- **Rollback**: If journaling fails, the salary history update is rolled back.

## Transactions & Rollback Behavior
- **Dependency**: Heavily dependent on the provided `client` for transactional integrity.
- **Journal Enforcement**: Unlike the legacy module which might handle journaling as a secondary step, this service enforces journaling within the primary execution flow.

## Failure Modes
- **Employee Not Found**: Throws immediate error.
- **Journal Imbalance**: Catch-all for accounting rule violations.

## Side Effects
- Updates global financial records immediate upon execution (no 'Draft' state in this specific service).
