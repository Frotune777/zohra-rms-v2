# Advance Recovery Validation Module - Detailed Walkthrough

## Overview
The Advance Recovery Validation module prevents negative balances in employee advance accounts and enforces strict business rules for advance management and payroll deductions.

---

## Database Schema

### Table: `advance_ledger`
**Purpose:** Track all advance transactions and repayments

**Columns:**
- `id` (SERIAL PRIMARY KEY)
- `employee_id` (INTEGER) - References employees table
- `transaction_type` (VARCHAR) - 'Advance' or 'Repayment'
- `amount` (DECIMAL) - Transaction amount (always positive)
- `balance_after` (DECIMAL) - Running balance after transaction
- `notes` (TEXT) - Transaction description
- `payment_mode` (VARCHAR) - Cash, UPI, Bank Transfer
- `paid_by` (VARCHAR) - Person who processed payment
- `transaction_date` (DATE) - Transaction date
- `repayment_source` (VARCHAR) - Payroll, Manual, Cash, Retroactive
- `created_at` (TIMESTAMP)

**Constraints:**
```sql
CHECK (amount > 0)  -- Ensures all amounts are positive
```

**Indexes:**
```sql
idx_advance_ledger_employee_type (employee_id, transaction_type)
idx_advance_ledger_date (transaction_date)
```

---

## Backend Implementation

### File: `server/src/modules/payroll/controller.js`

#### Function: `runPayroll`
**Purpose:** Calculate payroll with advance deduction validation

**Logic Flow:**
```javascript
1. Get employee details (salary, attendance)
2. Calculate base salary, overtime, extra days
3. Query outstanding advance balance from advance_ledger
4. Determine deduction amount:
   - If balance ≤ 0: skip deduction (deductionAmount = 0)
   - If manual deduction provided: cap at outstanding balance
   - Default: deduct all outstanding (up to gross pay)
5. Calculate net pay = gross - deduction
6. Save to salary_history
```

**Key Code:**
```javascript
// Get Outstanding Advance Balance
const advanceBalanceRes = await client.query(`
    SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) 
        as outstanding_balance
    FROM advance_ledger 
    WHERE employee_id = $1
`, [emp.id]);

const outstandingBalance = parseFloat(advanceBalanceRes.rows[0].outstanding_balance || 0);

// Only deduct if balance > 0
if (outstandingBalance > 0) {
    deductionAmount = Math.min(manualDeduction || outstandingBalance, outstandingBalance);
}
```

#### Function: `markPaid`
**Purpose:** Mark payroll as paid and record advance repayment

**Logic Flow:**
```javascript
1. Update salary_history status to 'Paid'
2. If advance_deduction > 0:
   a. Calculate current ledger balance
   b. Calculate new balance after deduction
   c. Insert Repayment record with source = 'Payroll'
3. Create journal entries for accounting
4. Commit transaction
```

---

## API Endpoints

### POST `/api/employees/payroll/advance`
**Purpose:** Create advance or repayment transaction

**Request Body:**
```json
{
    "employeeId": 1,
    "type": "Repayment",
    "amount": 5000,
    "notes": "Partial repayment",
    "paymentMode": "Cash",
    "paidBy": "John Doe"
}
```

**Response:**
```json
{
    "success": true,
    "newBalance": 10000
}
```

**Error Responses:**
- `400` - Invalid amount, missing fields, balance exceeded
- `403` - Unauthorized (non-owner/accountant for repayments)
- `500` - Server error

---

## Business Rules Summary

| Rule | Enforcement Point | Status |
|------|------------------|--------|
| Amount > 0 | Database + Backend | ✅ |
| Skip recovery if balance ≤ 0 | Payroll controller | ✅ |
| Cap deduction at outstanding | Payroll controller | ✅ |
| Role-based repayment access | Advances controller | ✅ |
| Notes required (repayments) | Advances controller | ✅ |
| Paid by required (repayments) | Advances controller | ✅ |
| No overpayment | Advances controller | ✅ |
| Source tagging | Both controllers | ✅ |

---

## Testing

### Test Scenarios

**1. Payroll with Zero Balance:**
```
Employee has ₹0 outstanding
Run payroll
Expected: advance_deduction = 0, no repayment created
Result: PASS ✅
```

**2. Manual Repayment Exceeds Balance:**
```
Outstanding: ₹2,000
Attempt repayment: ₹5,000
Expected: Error "Repayment exceeds balance"
Result: PASS ✅
```

---

## Migration Script

**File:** `server/migrations/001_advance_recovery_validation.sql`

**Execution:**
```bash
cd server
node run_migration.js
```
