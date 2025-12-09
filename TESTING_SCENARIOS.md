# Al Zohra RMS - Testing Scenarios & Test Cases

**Test Plan Version:** 1.0  
**Date:** December 9, 2025  
**Tester:** QA Team  
**Application:** Al Zohra Restaurant Management System v2.0

---

## 📋 Test Overview

### Scope
Comprehensive functional testing of all major workflows and modules in the Al Zohra RMS system.

### Test Environment
- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:5000
- **Database:** PostgreSQL 15
- **Browser:** Chrome/Firefox (latest)

### Test Users
| Role | Email | Password | Access Level |
|------|-------|----------|--------------|
| Owner | owner@alzohra.com | owner123 | Full Access |
| Manager | manager@alzohra.com | manager123 | Manager Access |
| Staff | staff@alzohra.com | staff123 | Limited Access |

---

## 🧪 Test Scenarios

### TS-001: Employee Management Workflow

#### Test Case 1.1: Create New Employee
**Priority:** High  
**Prerequisites:** Logged in as Manager/Owner

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Employees page | Page loads with employee list | ⏳ |
| 2 | Click "Register New Employee" | Modal opens | ⏳ |
| 3 | Fill employee details (Name, Salary, Position) | Form accepts input | ⏳ |
| 4 | Click "Save" | Employee created, appears in list | ⏳ |
| 5 | Verify employee in database | Record exists with correct data | ⏳ |

**Test Data:**
```json
{
  "full_name": "Test Employee",
  "first_name": "Test",
  "last_name": "Employee",
  "position": "Waiter",
  "base_salary": 20000,
  "phone_number": "9876543215",
  "role": "staff"
}
```

#### Test Case 1.2: Update Employee Details
**Priority:** High  
**Prerequisites:** Employee exists

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Employees page | Page loads | ⏳ |
| 2 | Click Edit on employee | Edit modal opens | ⏳ |
| 3 | Update salary to 25000 | Form accepts change | ⏳ |
| 4 | Click "Save" | Employee updated | ⏳ |
| 5 | Verify history record created | History shows salary change | ⏳ |

#### Test Case 1.3: View Employee History
**Priority:** Medium  
**Prerequisites:** Employee with history exists

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Employees page | Page loads | ⏳ |
| 2 | Click on employee name | History panel expands | ⏳ |
| 3 | Verify history records | Shows all changes with dates | ⏳ |

#### Test Case 1.4: Delete Employee (Owner Only)
**Priority:** High  
**Prerequisites:** Logged in as Owner

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Employees page | Page loads | ⏳ |
| 2 | Click Delete on employee | Confirmation dialog appears | ⏳ |
| 3 | Confirm deletion | Employee deleted | ⏳ |
| 4 | Try as Manager | Delete button not visible | ⏳ |

---

### TS-002: Advance Ledger Workflow

#### Test Case 2.1: Create Advance
**Priority:** High  
**Prerequisites:** Employee exists

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Advances page | Page loads | ⏳ |
| 2 | Click "New Transaction" | Modal opens | ⏳ |
| 3 | Select employee | Employee selected | ⏳ |
| 4 | Select Type: Advance | Type selected | ⏳ |
| 5 | Enter amount: 5000 | Amount entered | ⏳ |
| 6 | Select payment mode: Cash | Mode selected | ⏳ |
| 7 | Enter paid by: "Manager Name" | Name entered | ⏳ |
| 8 | Enter notes: "Salary advance" | Notes entered | ⏳ |
| 9 | Click "Save" | Advance created | ⏳ |
| 10 | Verify balance updated | Balance shows 5000 | ⏳ |

**Test Data:**
```json
{
  "employee_id": 1,
  "transaction_type": "Advance",
  "amount": 5000,
  "payment_mode": "Cash",
  "paid_by": "Manager Name",
  "notes": "Salary advance for emergency"
}
```

#### Test Case 2.2: Record Manual Repayment
**Priority:** High  
**Prerequisites:** Employee has outstanding advance

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Advances page | Page loads | ⏳ |
| 2 | Click "New Transaction" | Modal opens | ⏳ |
| 3 | Select employee with advance | Employee selected | ⏳ |
| 4 | Select Type: Repayment | Type selected | ⏳ |
| 5 | Enter amount: 2000 | Amount entered | ⏳ |
| 6 | Enter notes | Notes required | ⏳ |
| 7 | Click "Save" | Repayment recorded | ⏳ |
| 8 | Verify balance updated | Balance shows 3000 (5000-2000) | ⏳ |

#### Test Case 2.3: Verify Balance Calculation
**Priority:** High  
**Prerequisites:** Multiple transactions exist

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Advances page | Page loads | ⏳ |
| 2 | View employee balance | Shows correct running balance | ⏳ |
| 3 | Verify transaction history | All transactions listed | ⏳ |
| 4 | Check balance formula | Advances - Repayments = Balance | ⏳ |

#### Test Case 2.4: Negative Balance Prevention
**Priority:** Critical  
**Prerequisites:** Employee with zero balance

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Advances page | Page loads | ⏳ |
| 2 | Try to create repayment | Should be prevented | ⏳ |
| 3 | Verify error message | "No outstanding balance" shown | ⏳ |

---

### TS-003: Payroll Processing Workflow

#### Test Case 3.1: Run Payroll Calculation
**Priority:** Critical  
**Prerequisites:** Employees exist, attendance recorded

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Payroll page | Page loads | ⏳ |
| 2 | Select month and year | Month/year selected | ⏳ |
| 3 | Click "Calculate All" | Calculation starts | ⏳ |
| 4 | Verify calculations | All employees calculated | ⏳ |
| 5 | Check days worked | Matches attendance records | ⏳ |
| 6 | Check advance deduction | Deducted from outstanding | ⏳ |
| 7 | Check net pay | Base - Advances = Net | ⏳ |

#### Test Case 3.2: Manual Adjustments
**Priority:** High  
**Prerequisites:** Payroll in draft state

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click on employee row | Process modal opens | ⏳ |
| 2 | Add overtime hours: 10 | Hours entered | ⏳ |
| 3 | Overtime rate auto-calculated | Rate shown | ⏳ |
| 4 | Add manual adjustment: +500 | Adjustment entered | ⏳ |
| 5 | Enter reason: "Performance bonus" | Reason entered | ⏳ |
| 6 | Click "Update Calculation" | Payroll updated | ⏳ |
| 7 | Verify net pay includes adjustment | Net pay increased by 500 | ⏳ |

#### Test Case 3.3: Approve Payroll
**Priority:** High  
**Prerequisites:** Payroll in draft state

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Review draft payroll | All calculations correct | ⏳ |
| 2 | Click "Approve" on employee | Status changes to Approved | ⏳ |
| 3 | Verify status change | Shows "Approved" badge | ⏳ |
| 4 | Try to edit approved payroll | Cannot edit | ⏳ |

#### Test Case 3.4: Process Payout
**Priority:** Critical  
**Prerequisites:** Payroll approved

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Payouts tab | Payout list shown | ⏳ |
| 2 | Click "Mark Paid" | Payment modal opens | ⏳ |
| 3 | Select payment mode: Bank Transfer | Mode selected | ⏳ |
| 4 | Enter paid by name | Name entered | ⏳ |
| 5 | Click "Confirm Payment" | Payment processed | ⏳ |
| 6 | Verify advance ledger updated | Repayment recorded | ⏳ |
| 7 | Verify journal entry created | Ledger entry exists | ⏳ |
| 8 | Check status | Shows "Paid" | ⏳ |

#### Test Case 3.5: Outstanding Balance Display
**Priority:** Medium  
**Prerequisites:** Employee has outstanding advance

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Payroll page | Page loads | ⏳ |
| 2 | View employee table | "Outstanding" column visible | ⏳ |
| 3 | Check employee with advance | Shows red amount | ⏳ |
| 4 | Check employee without advance | Shows ₹0 in gray | ⏳ |
| 5 | Click process on employee | Modal shows outstanding balance | ⏳ |

---

### TS-004: Vendor Payment Workflow

#### Test Case 4.1: View Vendor Details
**Priority:** High  
**Prerequisites:** Vendor with outstanding balance exists

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Vendor Payments | Page loads | ⏳ |
| 2 | Click "Process Payment" | Modal opens | ⏳ |
| 3 | Select vendor from dropdown | Vendor selected | ⏳ |
| 4 | Wait for details to load | Loading indicator shown | ⏳ |
| 5 | Verify outstanding balance shown | Large red amount displayed | ⏳ |
| 6 | Verify last payment info | Date, amount, mode shown | ⏳ |
| 7 | Verify bill summary | Total bills and payments shown | ⏳ |
| 8 | Verify recent payments | Last 5 payments listed | ⏳ |

#### Test Case 4.2: Process Vendor Payment
**Priority:** Critical  
**Prerequisites:** Vendor with outstanding balance

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Select vendor | Vendor details load | ⏳ |
| 2 | Verify amount auto-filled | Outstanding balance shown | ⏳ |
| 3 | Adjust amount to partial payment | Amount updated | ⏳ |
| 4 | Select payment mode: UPI | Mode selected | ⏳ |
| 5 | Enter reference number | Reference entered | ⏳ |
| 6 | Enter paid by | Name entered | ⏳ |
| 7 | Enter notes | Notes entered | ⏳ |
| 8 | Click "Process Payment" | Payment processed | ⏳ |
| 9 | Verify outstanding reduced | Balance updated | ⏳ |
| 10 | Verify ledger entry | Transaction recorded | ⏳ |

#### Test Case 4.3: Overpayment Protection
**Priority:** Critical  
**Prerequisites:** Vendor with outstanding balance

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Select vendor with ₹5000 outstanding | Vendor selected | ⏳ |
| 2 | Enter amount: ₹6000 | Amount entered | ⏳ |
| 3 | Click "Process Payment" | Error shown | ⏳ |
| 4 | Verify error message | "Exceeds outstanding balance" | ⏳ |
| 5 | Payment not processed | Balance unchanged | ⏳ |

---

### TS-005: Chicken Tracker Workflow

#### Test Case 5.1: Set Daily Rates
**Priority:** High  
**Prerequisites:** Logged in as Manager/Owner

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Chicken → Daily Rates | Page loads | ⏳ |
| 2 | Enter Tandoor rate: 180 | Rate entered | ⏳ |
| 3 | Enter Boiler rate: 160 | Rate entered | ⏳ |
| 4 | Enter Egg rate: 6 | Rate entered | ⏳ |
| 5 | Click "Save Rates" | Rates saved | ⏳ |
| 6 | Verify rates saved | Success message shown | ⏳ |

#### Test Case 5.2: Create Bill Entry
**Priority:** High  
**Prerequisites:** Daily rates set, vendor with markup rules exists

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Chicken → Bills | Page loads | ⏳ |
| 2 | Select vendor | Vendor selected | ⏳ |
| 3 | Select item | Item dropdown populated | ⏳ |
| 4 | Enter quantity: 100 | Quantity entered | ⏳ |
| 5 | Enter vendor rate: 185 | Rate entered | ⏳ |
| 6 | Verify expected rate calculated | Shows base + markup | ⏳ |
| 7 | Verify variance calculated | Shows difference | ⏳ |
| 8 | Click "Add Entry" | Bill created | ⏳ |
| 9 | Verify ledger updated | Transaction recorded | ⏳ |

#### Test Case 5.3: Markup Rules
**Priority:** Medium  
**Prerequisites:** Vendor exists

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Chicken → Vendors | Page loads | ⏳ |
| 2 | Click "Markup Rules" tab | Tab switches | ⏳ |
| 3 | Select vendor | Vendor selected | ⏳ |
| 4 | Enter item name: "Chicken" | Item entered | ⏳ |
| 5 | Select base rate: TandoorRate | Base selected | ⏳ |
| 6 | Select operator: + | Operator selected | ⏳ |
| 7 | Enter value: 10 | Value entered | ⏳ |
| 8 | Click "Save Rule" | Rule saved | ⏳ |
| 9 | Verify rule appears | Rule listed | ⏳ |

---

### TS-006: POS Workflow

#### Test Case 6.1: Create Order
**Priority:** Critical  
**Prerequisites:** Menu items exist

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to POS | Page loads with menu | ⏳ |
| 2 | Click on menu item | Item added to cart | ⏳ |
| 3 | Adjust quantity using +/- | Quantity updates | ⏳ |
| 4 | Add multiple items | All items in cart | ⏳ |
| 5 | Verify total calculation | Total = sum of items | ⏳ |
| 6 | Click "Place Order" | Order processed | ⏳ |
| 7 | Verify order saved | Success message shown | ⏳ |
| 8 | Verify revenue recorded | Journal entry created | ⏳ |

#### Test Case 6.2: Cart Management
**Priority:** Medium  
**Prerequisites:** Items in cart

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Add item to cart | Item appears | ⏳ |
| 2 | Click trash icon | Item removed | ⏳ |
| 3 | Add same item twice | Quantity increases | ⏳ |
| 4 | Clear cart | All items removed | ⏳ |

---

### TS-007: Financial Tracking Workflow

#### Test Case 7.1: Daily Summary
**Priority:** High  
**Prerequisites:** Transactions exist for the day

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Finance → Daily Summary | Page loads | ⏳ |
| 2 | Select date | Date selected | ⏳ |
| 3 | Verify sales total | Shows POS sales | ⏳ |
| 4 | Verify vendor payments | Shows payments by mode | ⏳ |
| 5 | Verify salary advances | Shows advances by mode | ⏳ |
| 6 | Verify cash flow | Calculated correctly | ⏳ |
| 7 | Check payment mode breakdown | Cash, UPI, Bank shown | ⏳ |

#### Test Case 7.2: Record Payment
**Priority:** High  
**Prerequisites:** Logged in as Manager/Owner

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to Finance | Page loads | ⏳ |
| 2 | Click "Record Payment" | Modal opens | ⏳ |
| 3 | Select category: Utility | Category selected | ⏳ |
| 4 | Enter amount: 5000 | Amount entered | ⏳ |
| 5 | Select payment mode: Cash | Mode selected | ⏳ |
| 6 | Enter description | Description entered | ⏳ |
| 7 | Click "Save" | Payment recorded | ⏳ |
| 8 | Verify journal entry | Ledger updated | ⏳ |

---

## 🐛 Issue Tracking Template

### Issue Format
```markdown
## Issue #XXX: [Brief Description]

**Severity:** Critical / High / Medium / Low
**Module:** [Module Name]
**Test Case:** TS-XXX
**Status:** Open / In Progress / Fixed / Closed

### Description
[Detailed description of the issue]

### Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Screenshots/Logs
[Attach screenshots or error logs]

### Fix Details
[Description of the fix applied]

### Verification
[How the fix was verified]
```

---

## 📊 Test Execution Summary

### Test Statistics
- **Total Test Cases:** 0
- **Passed:** 0
- **Failed:** 0
- **Blocked:** 0
- **Not Executed:** 0
- **Pass Rate:** 0%

### Test Coverage by Module
| Module | Test Cases | Passed | Failed | Coverage |
|--------|------------|--------|--------|----------|
| Employee Management | 4 | 0 | 0 | 0% |
| Advance Ledger | 4 | 0 | 0 | 0% |
| Payroll | 5 | 0 | 0 | 0% |
| Vendor Payments | 3 | 0 | 0 | 0% |
| Chicken Tracker | 3 | 0 | 0 | 0% |
| POS | 2 | 0 | 0 | 0% |
| Finance | 2 | 0 | 0 | 0% |
| **Total** | **23** | **0** | **0** | **0%** |

---

## 📝 Notes

- All tests should be executed in a clean test environment
- Test data should be created fresh for each test run
- Database should be backed up before testing
- Critical issues should be fixed immediately
- Test results should be updated after each test execution

---

**Test Plan Status:** Draft  
**Next Update:** After test execution  
**Approved By:** [Pending]
