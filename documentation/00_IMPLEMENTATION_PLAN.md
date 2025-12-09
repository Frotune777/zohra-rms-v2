# Vendor Payment & Ledger System Implementation Plan

## Overview

This plan covers two major enhancements:
1. **Advance Recovery Validation** - Prevent negative balances and improve UX
2. **Vendor Payment & Ledger System** - Complete vendor management like Tally

---

## Part 1: Advance Recovery Validation Enhancements

### Database Changes

#### 1.1 Add Constraints to `advance_ledger`
```sql
-- Ensure amount is always positive
ALTER TABLE advance_ledger 
ADD CONSTRAINT advance_ledger_amount_positive 
CHECK (amount > 0);

-- Add index for performance
CREATE INDEX idx_advance_ledger_employee_type 
ON advance_ledger(employee_id, transaction_type);
```

### Backend Changes

#### 1.2 Update Payroll Controller (`server/src/modules/payroll/controller.js`)

**Changes to `runPayroll` function:**
- Query current outstanding balance before calculating deduction
- Skip deduction if balance ≤ 0
- Return outstanding balance to frontend

**Changes to `markPaid` function:**
- Add validation: `if (deductionAmount > currentBalance)` throw error
- Prevent negative `balance_after`

#### 1.3 Update Advances Controller (`server/src/modules/employees/controller.js`)

**Add validation to manual repayment:**
```javascript
// Check role
if (userRole !== 'owner' && userRole !== 'accountant') {
  return res.status(403).json({ error: 'Unauthorized' });
}

// Require notes
if (!notes || notes.trim().length === 0) {
  return res.status(400).json({ error: 'Notes required for manual repayments' });
}

// Check outstanding balance
const balance = await getOutstandingBalance(employeeId);
if (amount > balance) {
  return res.status(400).json({ 
    error: `Repayment amount (₹${amount}) exceeds outstanding balance (₹${balance})` 
  });
}
```

### Frontend Changes

#### 1.4 Update Payroll Page (`client/src/pages/Payroll.jsx`)
- Display `total_outstanding_advances` for each employee
- Show warning if deduction > outstanding
- Disable/reduce deduction input if balance is 0

#### 1.5 Update Advances Page (`client/src/pages/Advances.jsx`)
- Add role check for manual repayment button
- Make notes field required for repayments
- Show current balance before repayment form
- Add repayment source tag display

---

## Part 2: Vendor Payment & Ledger System

### Database Schema

#### 2.1 Review Existing Tables

Check if these exist:
- `suppliers` (vendors)
- `vendor_ledger`
- `bill_entries`

#### 2.2 Create New Tables

**`vendor_categories`**
```sql
CREATE TABLE vendor_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  expense_account_code INTEGER REFERENCES chart_of_accounts(code),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO vendor_categories (name, expense_account_code, description) VALUES
('COGS - Nonveg', 5100, 'Cost of Goods Sold - Meat/Chicken'),
('COGS - Dairy', 5200, 'Cost of Goods Sold - Milk/Paneer'),
('COGS - Grocery', 5300, 'Cost of Goods Sold - Spices/Rice'),
('Opex - Fuel', 6100, 'Operating Expense - Fuel'),
('Opex - Packaging', 6200, 'Operating Expense - Packaging'),
('Opex - Gas Cylinder', 6300, 'Operating Expense - Gas');
```

**Update `suppliers` table (if exists) or create:**
```sql
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES vendor_categories(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
```

**`vendor_payments`**
```sql
CREATE TABLE vendor_payments (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES suppliers(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_mode VARCHAR(50) NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit Adjustment')),
  reference_number VARCHAR(100),
  notes TEXT,
  paid_by VARCHAR(100),
  attachment_url TEXT,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES employees(id)
);

CREATE INDEX idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX idx_vendor_payments_date ON vendor_payments(payment_date);
```

**Update `vendor_ledger` (if exists):**
```sql
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50);
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);
ALTER TABLE vendor_ledger ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES vendor_categories(id);
```

### Backend API

#### 2.3 Vendor Categories Routes (`server/src/modules/vendors/categories.controller.js`)

**Endpoints:**
- `GET /api/vendors/categories` - List all categories
- `POST /api/vendors/categories` - Create category (owner only)
- `PUT /api/vendors/categories/:id` - Update category
- `DELETE /api/vendors/categories/:id` - Delete category

#### 2.4 Vendor Payment Routes (`server/src/modules/vendors/payments.controller.js`)

**Endpoints:**
- `POST /api/vendors/payments` - Process payment
- `GET /api/vendors/payments` - List payments (with filters)
- `GET /api/vendors/:id/payments` - Get vendor payment history
- `GET /api/vendors/:id/outstanding` - Get outstanding balance

**Payment Processing Logic:**
```javascript
exports.processPayment = async (req, res) => {
  const { vendorId, amount, paymentMode, reference, notes, paidBy } = req.body;
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Validate vendor exists
    const vendor = await client.query('SELECT * FROM suppliers WHERE id = $1', [vendorId]);
    if (vendor.rows.length === 0) throw new Error('Vendor not found');
    
    // 2. Get outstanding balance
    const balanceRes = await client.query(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Bill' THEN amount 
                               WHEN transaction_type = 'Payment' THEN -amount 
                               ELSE 0 END), 0) as outstanding
      FROM vendor_ledger WHERE supplier_id = $1
    `, [vendorId]);
    
    const outstanding = parseFloat(balanceRes.rows[0].outstanding);
    
    // 3. Validate amount
    if (amount <= 0) throw new Error('Amount must be positive');
    if (amount > outstanding) throw new Error(`Payment (₹${amount}) exceeds outstanding (₹${outstanding})`);
    
    // 4. Insert payment record
    const paymentRes = await client.query(`
      INSERT INTO vendor_payments 
      (vendor_id, amount, payment_mode, reference_number, notes, paid_by, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [vendorId, amount, paymentMode, reference, notes, paidBy, req.user.id]);
    
    // 5. Update vendor_ledger
    await client.query(`
      INSERT INTO vendor_ledger 
      (supplier_id, date, transaction_type, amount, details, payment_mode, reference_number)
      VALUES ($1, CURRENT_DATE, 'Payment', $2, $3, $4, $5)
    `, [vendorId, -amount, notes, paymentMode, reference]);
    
    // 6. Create journal entry
    const jeRes = await client.query(`
      INSERT INTO journal_entries (transaction_date, description)
      VALUES (CURRENT_DATE, $1) RETURNING id
    `, [`Vendor Payment - ${vendor.rows[0].name}`]);
    
    const jeId = jeRes.rows[0].id;
    
    // 7. Debit: Vendor Payable (2000)
    await client.query(`
      INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
      VALUES ($1, 2000, $2, 0)
    `, [jeId, amount]);
    
    // 8. Credit: Cash/Bank/UPI based on payment mode
    const creditAccount = paymentMode === 'Cash' ? 1000 : 
                          paymentMode === 'UPI' ? 1020 : 1010;
    await client.query(`
      INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
      VALUES ($1, $2, 0, $3)
    `, [jeId, creditAccount, amount]);
    
    await client.query('COMMIT');
    res.json({ success: true, payment: paymentRes.rows[0] });
    
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
};
```

#### 2.5 Vendor Ledger Routes

**Endpoints:**
- `GET /api/vendors/:id/ledger` - Get vendor ledger with filters
- `GET /api/vendors/ledger/summary` - Category-wise summary

### Frontend UI

#### 2.6 Vendor Payment Modal (`client/src/components/VendorPaymentModal.jsx`)

**Features:**
- Vendor dropdown with outstanding balance display
- Amount input with validation
- Payment mode selector
- Reference number field
- Notes textarea (required)
- Paid by dropdown
- Real-time outstanding calculation

#### 2.7 Vendor Ledger Page (`client/src/pages/VendorLedger.jsx`)

**Features:**
- Vendor filter dropdown
- Category filter
- Date range picker
- Ledger table showing:
  - Date
  - Transaction type (Bill/Payment)
  - Amount
  - Payment mode
  - Balance
- Summary cards:
  - Total purchases
  - Total paid
  - Net outstanding

### Validation Rules

#### 2.8 Backend Validation Middleware

```javascript
const validatePayment = (req, res, next) => {
  const { vendorId, amount, paymentMode } = req.body;
  
  if (!vendorId) return res.status(400).json({ error: 'Vendor required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  if (!['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit Adjustment'].includes(paymentMode)) {
    return res.status(400).json({ error: 'Invalid payment mode' });
  }
  
  next();
};
```

### Integration Points

#### 2.9 Daily Summary Integration

Update `server/src/modules/finance/controller.js`:

```javascript
// In getDailySummary, add vendor payments
const vendorPaymentsRes = await db.query(`
  SELECT 
    COALESCE(SUM(CASE WHEN payment_mode = 'Cash' THEN amount ELSE 0 END), 0) as cash_payments,
    COALESCE(SUM(CASE WHEN payment_mode = 'UPI' THEN amount ELSE 0 END), 0) as upi_payments,
    COALESCE(SUM(CASE WHEN payment_mode = 'Bank Transfer' THEN amount ELSE 0 END), 0) as bank_payments
  FROM vendor_payments
  WHERE payment_date = $1
`, [date]);
```

---

## Implementation Order

1. ✅ **Advance Recovery Validation** (2-3 hours)
   - Database constraints
   - Backend validation
   - Frontend UX improvements

2. **Database Schema** (1 hour)
   - Create vendor_categories
   - Update suppliers table
   - Create vendor_payments table

3. **Backend API** (3-4 hours)
   - Category management
   - Payment processing
   - Ledger queries
   - Validation middleware

4. **Frontend UI** (3-4 hours)
   - Payment modal
   - Ledger page
   - Outstanding widgets

5. **Testing & Integration** (2 hours)
   - Test payment flows
   - Verify ledger accuracy
   - Test daily summary integration

---

## Verification Plan

### Advance Recovery
- [ ] Test payroll with zero balance - should skip deduction
- [ ] Test manual repayment > balance - should reject
- [ ] Test manual repayment without notes - should reject
- [ ] Verify role-based access for manual repayments

### Vendor Payments
- [ ] Test full payment
- [ ] Test partial payment
- [ ] Test overpayment protection
- [ ] Verify general ledger entries
- [ ] Verify daily summary updates
- [ ] Test category-wise filtering
