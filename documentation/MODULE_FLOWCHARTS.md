# Al Zohra RMS v2 - Module Flowcharts

This document provides visual flowcharts for the core modules of the system to facilitate better understanding of the operational workflows.

## 1. POS & Order Management
```mermaid
graph TD
    A[Start Order] --> B{Select Category}
    B --> C[Add Menu Items to Cart]
    C --> D[Review Order]
    D --> E{Process Payment?}
    E -->|Yes| F[Select Payment Mode: Cash/UPI/Card]
    F --> G[Generate Invoice]
    G --> H[Send Order to Kitchen - KDS]
    H --> I[Mark as Served]
    E -->|No| J[Save as Draft/Pending]
```

## 2. Inventory & Chicken Tracking
```mermaid
graph TD
    A[Daily Rate Update] --> B[Procurement: Bill Entry]
    B --> C{Verify Qty & Quality}
    C --> D[Apply Markup Rules]
    D --> E[Compare Against Market Rate]
    E --> F[Calculate Variance]
    F --> G[Update Vendor Ledger]
    G --> H[Update Inventory Stock]
    H --> I[Wastage Tracking]
```

## 3. HR, Attendance & Payroll
```mermaid
graph TD
    A[Daily Attendance] --> B{Mark Status}
    B -->|Present/Holiday| C[Calculate Working Hours]
    B -->|Absent| D[Deduction Policy]
    E[Advance Requests] --> F[Manager Approval]
    F --> G[Disbursement via Ledger]
    G --> H[Monthly Payroll Run]
    H --> I[Fetch Balance from Advance Ledger]
    I --> J[Apply Deductions & Bonus]
    J --> K[Approve Payroll]
    K --> L[Generate Payslip & Mark Paid]
```

## 4. Financial Ledger & Daily Summary
```mermaid
graph TD
    A[Sales Income - POS] --> B[Daily Summary Aggregator]
    C[Expenses - Manual Entry] --> B
    D[Vendor Payments] --> B
    E[Salary Advances] --> B
    B --> F[Net Cash Flow Calculation]
    F --> G[Payment Mode Wise Breakdown]
    G --> H[Journal Entry Generation]
    H --> I[Master Ledger Update]
    I --> J[P&L Statement Generation]
```

## 5. Vendor Payments & Outstanding
```mermaid
graph TD
    A[Vendor Master Record] --> B[Historical Bills - Ledger]
    B --> C[Historical Payments - Ledger]
    C --> D[Real-time Outstanding Balance]
    D --> E[Initiate Payment Modal]
    E --> F[Select Bill/Category]
    F --> G[Enter Amount & Mode]
    G --> H[Process Payment]
    H --> I[Update Vendor Ledger & AP Account]
```
