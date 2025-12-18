# Reports Module

## Responsibilities
- Aggregation and presentation of system-wide data for analytical purposes.
- Generation of specialized reports: Financial, HR & Payroll, Operations, and Dashboard KPIs.
- Exporting data in various formats (handled via frontend, but driven by these APIs).
- Providing historical trends and variance analysis (e.g., Chicken Bill variance).

## Folder Structure
- `server/src/modules/reports/`
    - `controller.js`: A massive procedural controller containing optimized SQL queries for all report types.
    - `routes.js`: Defines API endpoints for specific report categories.

## DB Tables Used
- Virtually all major tables: `journal_entries`, `ledger_lines`, `salary_history`, `wastage_logs`, `bill_entries`, `orders`, `inventory_items`, etc.

## Public Services & Methods
- **Controller Methods**:
    - `getFinancialReports`: P&L, Balance Sheet, Ledger summaries.
    - `getPayrollReports`: Salary history, advance tracking, attendance analytics.
    - `getOperationsReports`: Wastage trends, stock turnover, vendor performance.
    - `getDashboardKPIs`: Real-time stats for the main dashboard (Sales, Expenses, Pending Actions).
    - `getChickenBillerAnalytics`: Detailed analysis of chicken purchase rates and variances.

## Core Business Rules
- **Date Range Defaults**: Most reports default to the current month if no range is provided.
- **Empty State Handling**: Uses `COALESCE` and `LEFT JOIN` extensively to ensure reports remain readable even with no data for a period.
- **Transactional Consistency**: Financial reports rely on finalized journal entries for accuracy.

## Accounting Impact
- No direct impact on the ledger.
- Provides the primary interface for interpreting the results of all accounting transactions.

## Risks / Unclear Logic
- **Query Complexity**: The `controller.js` contains extremely long and complex raw SQL queries. Changes to the underlying schema must be carefully reflected here.
- **Performance**: Large date ranges or high transaction volumes may lead to slow report generation if not properly indexed.
- **Hardcoded Logic**: Some business logic for 'Health Scores' or 'Performance Indices' is embedded directly in the SQL queries.
