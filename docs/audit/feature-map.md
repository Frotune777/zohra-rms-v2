# Feature map

All 32 explicitly routed screens are indexed. Source mapping is verified; full feature correctness remains pending. The dependency smoke covers selected routes only.

| Route | Component/source | Direct API expressions (shared hooks may add calls) |
| --- | --- | --- |
| /login | Login — client/src/pages/Login.jsx | Shared hooks/context; see repository-inventory.json |
| / | POS — client/src/pages/POS.jsx | GET menu; POST orders |
| /dashboard | MasterDashboard — client/src/pages/MasterDashboard.jsx | GET dashboard/stats |
| /employees | EmployeeManagement — client/src/pages/EmployeeManagement.jsx | DELETE /employees/${id}; GET /employees; GET /employees/${employee.id}/history; POST /employees; PUT /employees/${editingId} |
| /menu | MenuManagement — client/src/pages/MenuManagement.jsx | DELETE menu/${id}; GET menu; POST menu |
| /payroll | Payroll — client/src/pages/Payroll.jsx | DELETE payroll/${confirmAction.id}; GET payroll/monthly; POST payroll/approve; POST payroll/payout; POST payroll/revert/${confirmAction.id}; POST payroll/run |
| /advances | Advances — client/src/pages/Advances.jsx | GET employees; GET employees/payroll/advances; GET http://localhost:5000/api/employees/payroll/advances/${selectedEmployee}; POST employees/payroll/advance |
| /vendor-payments | VendorPayments — client/src/pages/VendorPayments.jsx | GET /vendors/${vendorId}/details; GET /vendors/categories; GET /vendors/outstanding; GET /vendors/payments; POST /vendors/payments |
| /inventory | Inventory — client/src/pages/Inventory.jsx | DELETE /inventory/${id}; GET /inventory; POST /inventory; PUT /inventory/${editingId} |
| /finance | Finance — client/src/pages/Finance.jsx | DELETE finance/transaction/${id}; GET /finance/pnl; GET /finance/pnl/yearly; GET /finance/transactions |
| /finance/payments | PaymentEntry — client/src/pages/finance/PaymentEntry.jsx | GET /chicken/suppliers; POST /finance/payment |
| /finance/summary | DailySummary — client/src/pages/finance/DailySummary.jsx | GET /finance/daily-balance/${date}?type=Counter; GET /finance/daily-summary?date=${date}; POST /finance/daily-balance/reopen |
| /finance/daily-tracker | DailyTracker — client/src/pages/finance/DailyTracker.jsx | GET /finance/daily-balance/${date}; GET /finance/daily-summary/${date}; GET /finance/mappings; GET /finance/tracker/categories; GET /finance/tracker/transactions?date=${date}; GET /vendors/all-suppliers; POST /finance/tracker/transaction |
| /finance/float | ManagerFloat — client/src/pages/finance/ManagerFloat.jsx | GET finance/reconciliation/float?date=${date} |
| /finance/mappings | ExpenseMapping — client/src/pages/finance/ExpenseMapping.jsx | DELETE finance/mappings/${id}; GET finance/mappings; GET finance/tracker/categories; POST finance/mappings; POST finance/mappings/${id}/apply; PUT finance/mappings/${editingId} |
| /finance/transfer | MoneyTransfer — client/src/pages/finance/MoneyTransfer.jsx | GET /auth/users; GET /employees; GET /finance/payment-modes; POST /finance/transfer/safe-to-user; POST /finance/transfer/user-to-safe |
| /attendance/bulk | BulkAttendance — client/src/pages/BulkAttendance.jsx | GET /attendance/calendar?startDate=${startDate.toISOString().split(; GET /attendance/last-dates; GET /attendance?date=${date}; GET /employees; GET /leaves/date/${date}; POST /attendance/bulk |
| /attendance/leaves | LeaveManagement — client/src/pages/LeaveManagement.jsx | GET /employees; GET /leaves${params}; POST /leaves; PUT /leaves/${id}/approve; PUT /leaves/${id}/reject |
| /advances/approvals | AdvanceApprovals — client/src/pages/AdvanceApprovals.jsx | GET employees/payroll/requests; POST employees/payroll/requests/${id}/approve; POST employees/payroll/requests/${id}/reject |
| /ai-dashboard | AIDashboard — client/src/pages/AIDashboard.jsx | GET ai/forecast/${itemId}; GET ai/suggested-orders; GET inventory |
| /chicken | ChickenDashboard — client/src/pages/chicken/ChickenDashboard.jsx | GET chicken/bills/summary; GET chicken/bills?limit=5; GET chicken/rates?date=${date}; PATCH chicken/bills/${bill.id}/status |
| /chicken/rates | DailyRates — client/src/pages/chicken/DailyRates.jsx | GET chicken/rates/status?date=${date}; GET chicken/rates?date=${date}; POST chicken/rates |
| /chicken/bills | BillEntry — client/src/pages/chicken/BillEntry.jsx | GET chicken/markups?supplierId=${supplierId}; GET chicken/suppliers; POST chicken/bills |
| /chicken/vendors | VendorManager — client/src/pages/chicken/VendorManager.jsx | DELETE chicken/markups/${ruleId}; GET chicken/markups?supplierId=${supplierId}; GET chicken/rates?date=${date}; GET chicken/suppliers; POST chicken/markups; POST chicken/rates; POST chicken/suppliers; PUT chicken/markups/${editingRule.id}; PUT chicken/suppliers/${editingSupplierId} |
| /reports | ReportsDashboard — client/src/pages/reports/ReportsDashboard.jsx | GET reports/dashboard/kpis |
| /reports/financial | FinancialReports — client/src/pages/reports/FinancialReports.jsx | GET reports/financial/balance-sheet; GET reports/financial/expense-breakdown; GET reports/financial/overview; GET reports/financial/spending-by-person |
| /reports/hr | HRReports — client/src/pages/reports/HRReports.jsx | GET reports/hr/advances; GET reports/hr/attendance; GET reports/hr/payroll-summary |
| /reports/operations | OperationsReports — client/src/pages/reports/OperationsReports.jsx | GET reports/operations/chicken-analytics; GET reports/operations/vendor-performance |
| /reports/inventory | InventoryReports — client/src/pages/reports/InventoryReports.jsx | GET reports/inventory/stock-status; GET reports/inventory/wastage |
| /config | ConfigManager — client/src/pages/config/ConfigManager.jsx | DELETE config/${activeCategory}/${id}; GET config/${category}; GET config/categories; PATCH config/${activeCategory}/${id}/toggle; POST config/${activeCategory}; POST config/${activeCategory}/bulk-import; PUT config/${activeCategory}/${editingOption.id} |
| /approvals | ApprovalsDashboard — client/src/pages/ApprovalsDashboard.jsx | GET chicken/bills?status=Approved; GET chicken/bills?status=Pending; GET employees/payroll/requests; PATCH chicken/bills/${id}/status; POST employees/payroll/requests/${id}/approve; POST employees/payroll/requests/${id}/reject |
| /development-status | DevelopmentStatus — client/src/pages/DevelopmentStatus.jsx | Shared hooks/context; see repository-inventory.json |

## Backend registrations

Registration counts before the chicken alias, not passing test counts.

| Module | Routes | GET routes |
| --- | ---: | ---: |
| advance-requests | 5 | 2 |
| ai | 2 | 2 |
| attendance | 4 | 3 |
| auth | 4 | 2 |
| config | 8 | 2 |
| dashboard | 1 | 1 |
| employees | 17 | 9 |
| finance | 31 | 15 |
| inventory | 23 | 10 |
| leaves | 7 | 3 |
| operations | 5 | 2 |
| payroll | 6 | 1 |
| pos | 4 | 1 |
| reports | 12 | 12 |
| vendors | 13 | 12 |

Dedicated KDS, recipe-management, adjustment/wastage and purchase-order screens are not routed in App.jsx. Audit their actual UI integrations plus APIs/database behavior rather than assuming legacy URLs exist.

The initial matrix has **166 cases**, including all 32 screen entries. Every case is Pending. Expand it when a new rule, endpoint variant or cross-feature interaction is discovered.
