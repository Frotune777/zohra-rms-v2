MODULE: HR & Payroll

RESPONSIBILITIES:
- Employees
- Attendance
- Salary structure
- Advances & recoveries
- Payroll processing

DOMAIN OBJECTS:
- Employee
- Advance
- PayrollRun
- AttendanceRecord

RULES:
- Advances require approval workflow
- Payroll runs are immutable after posting
- Salary changes do not affect historical payroll

ACCOUNTING IMPACT:
- Advance → Employee Receivable
- Payroll → Salary Expense + Payable
- Recovery → Cash/Bank + Advance Reduction

FORBIDDEN:
- Editing posted payroll
- Skipping accounting entries
- Manual advance adjustments

EXPECTED BEHAVIOR:
- Payroll acts like a financial period
- Recoveries automatically applied
