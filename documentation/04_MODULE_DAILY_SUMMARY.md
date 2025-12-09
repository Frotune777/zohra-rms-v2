# Daily Summary Integration Module - Detailed Walkthrough

## Overview
Integration of vendor payments and salary advances into daily cash flow tracking with payment mode breakdown (Cash/UPI/Bank) and automatic ledger updates.

---

## Module Purpose

**Goal:** Provide real-time daily financial summary including:
- Sales revenue
- Operating expenses
- Vendor payments (by mode)
- Salary advances (by mode)
- Net cash flow (by mode and total)

---

## Backend Implementation

### File: `server/src/modules/finance/controller.js`

#### Function: `getDailySummary`
**Purpose:** Generate comprehensive daily financial summary

### Enhanced Logic Flow

```
1. Query sales revenue (account_code 4000)
2. Query operating expenses (account_codes 5000, 6000)
3. Query vendor payments from vendor_payments table
   - Group by payment_mode
   - Calculate totals per mode
4. Query salary advances from advance_ledger
   - Group by payment_mode
   - Calculate totals per mode
5. Calculate cash flow by mode:
   - Cash flow = Sales - Vendor Payments - Advances
6. Return detailed breakdown
```

---

## Code Implementation

### Vendor Payments Query
```javascript
const vendorPaymentsRes = await db.query(`
    SELECT 
        payment_mode,
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count
    FROM vendor_payments
    WHERE payment_date = $1
    GROUP BY payment_mode
`, [date]);
```

### Vendor Payments Aggregation
```javascript
const vendorPayments = {
    total: 0,
    cash: 0,
    upi: 0,
    bank: 0,
    cheque: 0,
    breakdown: []
};

vendorPaymentsRes.rows.forEach(row => {
    const amount = parseFloat(row.total);
    vendorPayments.total += amount;
    vendorPayments.breakdown.push({
        mode: row.payment_mode,
        amount: amount,
        count: parseInt(row.count)
    });

    // Map to specific fields
    if (row.payment_mode === 'Cash') vendorPayments.cash = amount;
    else if (row.payment_mode === 'UPI') vendorPayments.upi = amount;
    else if (row.payment_mode === 'Bank Transfer') vendorPayments.bank = amount;
    else if (row.payment_mode === 'Cheque') vendorPayments.cheque = amount;
});
```

### Salary Advances Query
```javascript
const advanceRes = await db.query(`
    SELECT 
        payment_mode,
        COALESCE(SUM(amount), 0) as total
    FROM advance_ledger
    WHERE transaction_type = 'Advance'
    AND DATE(transaction_date) = $1
    GROUP BY payment_mode
`, [date]);
```

### Salary Advances Aggregation
```javascript
const advances = {
    total: 0,
    cash: 0,
    upi: 0,
    bank: 0
};

advanceRes.rows.forEach(row => {
    const amount = parseFloat(row.total);
    advances.total += amount;
    if (row.payment_mode === 'Cash') advances.cash = amount;
    else if (row.payment_mode === 'UPI') advances.upi = amount;
    else if (row.payment_mode === 'Bank Transfer') advances.bank = amount;
});
```

### Cash Flow Calculation
```javascript
const cashFlow = {
    cash: sales - vendorPayments.cash - advances.cash,
    upi: -vendorPayments.upi - advances.upi,
    bank: -vendorPayments.bank - advances.bank,
    total: sales - expenses - vendorPayments.total - advances.total
};
```

---

## API Endpoint

### GET `/api/finance/daily-summary?date=2025-12-09`

**Response Structure:**
```json
{
    "date": "2025-12-09",
    "sales": 50000,
    "expenses": 15000,
    "vendor_payments": {
        "total": 13000,
        "cash": 10000,
        "upi": 3000,
        "bank": 0,
        "cheque": 0,
        "breakdown": [
            {
                "mode": "Cash",
                "amount": 10000,
                "count": 1
            },
            {
                "mode": "UPI",
                "amount": 3000,
                "count": 1
            }
        ]
    },
    "salary_advances": {
        "total": 19000,
        "cash": 14000,
        "upi": 5000,
        "bank": 0
    },
    "cash_flow": {
        "cash": 26000,
        "upi": -8000,
        "bank": 0,
        "total": 3000
    },
    "net_cash_flow": 3000
}
```

---

## Integration Points

### 1. Cash Ledger Update
**When:** Cash payment processed
**Action:** Debit Cash account (1000)

```javascript
// In processPayment function
if (paymentMode === 'Cash') {
    await client.query(`
        INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
        VALUES ($1, 1000, 0, $2)
    `, [jeId, amount]);
}
```

### 2. UPI Ledger Update
**When:** UPI payment processed
**Action:** Debit UPI account (1020)

```javascript
if (paymentMode === 'UPI') {
    await client.query(`
        INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
        VALUES ($1, 1020, 0, $2)
    `, [jeId, amount]);
}
```

### 3. Bank Ledger Update
**When:** Bank transfer processed
**Action:** Debit Bank account (1010)

```javascript
if (paymentMode === 'Bank Transfer') {
    await client.query(`
        INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
        VALUES ($1, 1010, 0, $2)
    `, [jeId, amount]);
}
```

### 4. Vendor Payable Account
**When:** Any vendor payment
**Action:** Credit Vendor Payable (2000)

```javascript
await client.query(`
    INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
    VALUES ($1, 2000, $2, 0)
`, [jeId, amount]);
```

---

## Cash Flow Calculation Logic

### Formula
```
Cash Flow (by mode) = Inflows - Outflows

Cash:
  Inflows: Sales (assumed cash)
  Outflows: Vendor payments (cash) + Advances (cash)
  Cash Flow = Sales - Vendor Cash - Advance Cash

UPI:
  Inflows: 0 (no UPI sales in this version)
  Outflows: Vendor payments (UPI) + Advances (UPI)
  UPI Flow = 0 - Vendor UPI - Advance UPI

Bank:
  Inflows: 0 (no bank sales in this version)
  Outflows: Vendor payments (bank) + Advances (bank)
  Bank Flow = 0 - Vendor Bank - Advance Bank

Total:
  Total Flow = Sales - Expenses - Vendor Total - Advance Total
```

---

## Frontend Integration

### File: `client/src/pages/finance/DailySummary.jsx`

**Display Components:**
1. **Summary Cards**
   - Total Sales
   - Total Expenses
   - Vendor Payments
   - Salary Advances
   - Net Cash Flow

2. **Payment Mode Breakdown**
   - Cash transactions
   - UPI transactions
   - Bank transactions
   - Cheque transactions

3. **Cash Flow Chart**
   - Visual representation by mode
   - Trend analysis

---

## Example Scenarios

### Scenario 1: Cash-Heavy Day
```json
{
    "sales": 50000,
    "vendor_payments": {
        "cash": 20000,
        "upi": 0
    },
    "salary_advances": {
        "cash": 5000,
        "upi": 0
    },
    "cash_flow": {
        "cash": 25000,  // 50000 - 20000 - 5000
        "total": 25000
    }
}
```

### Scenario 2: Mixed Payment Modes
```json
{
    "sales": 50000,
    "vendor_payments": {
        "cash": 10000,
        "upi": 5000,
        "bank": 3000
    },
    "salary_advances": {
        "cash": 2000,
        "upi": 1000
    },
    "cash_flow": {
        "cash": 38000,   // 50000 - 10000 - 2000
        "upi": -6000,    // 0 - 5000 - 1000
        "bank": -3000,   // 0 - 3000
        "total": 29000   // 50000 - 18000 - 3000
    }
}
```

---

## Testing

### Test Case 1: Vendor Payment Integration
```javascript
// Create vendor payment
POST /api/vendors/payments
{
    "vendorId": 1,
    "amount": 10000,
    "paymentMode": "Cash"
}

// Check daily summary
GET /api/finance/daily-summary?date=2025-12-09

// Verify:
// vendor_payments.cash = 10000
// cash_flow.cash reduced by 10000
```

### Test Case 2: Salary Advance Integration
```javascript
// Create salary advance
POST /api/employees/payroll/advance
{
    "employeeId": 1,
    "type": "Advance",
    "amount": 5000,
    "paymentMode": "UPI"
}

// Check daily summary
GET /api/finance/daily-summary?date=2025-12-09

// Verify:
// salary_advances.upi = 5000
// cash_flow.upi reduced by 5000
```

---

## Performance Optimization

**Indexes Used:**
- `vendor_payments.payment_date` - Fast date filtering
- `advance_ledger.transaction_date` - Fast date filtering

**Query Optimization:**
- GROUP BY payment_mode reduces result set
- COALESCE handles NULL values efficiently
- Single query per data source

---

## Reporting Features

### Daily Summary Report
- Sales vs Expenses
- Payment mode distribution
- Cash flow by mode
- Outstanding vendor balances

### Weekly Summary
```javascript
// Aggregate daily summaries for week
const startDate = '2025-12-01';
const endDate = '2025-12-07';

// Query daily summaries for date range
// Sum totals for weekly report
```

### Monthly Summary
```javascript
// Similar to weekly, but for entire month
// Include trend analysis
// Compare with previous month
```

---

## Account Codes Reference

| Account | Code | Type | Usage |
|---------|------|------|-------|
| Cash | 1000 | Asset | Cash payments |
| Bank | 1010 | Asset | Bank transfers |
| UPI | 1020 | Asset | UPI payments |
| Vendor Payable | 2000 | Liability | Vendor obligations |
| Sales Revenue | 4000 | Revenue | Sales income |
| COGS | 5000 | Expense | Cost of goods |
| Operating Expense | 6000 | Expense | Opex |

---

## Common Issues

**Issue:** Cash flow doesn't match physical cash
**Solution:** Verify all cash transactions recorded with correct payment_mode

**Issue:** Vendor payments not showing in summary
**Solution:** Check payment_date matches query date

**Issue:** Negative cash flow
**Solution:** Normal if outflows > inflows; review payment timing

---

## Future Enhancements

- [ ] Sales by payment mode tracking
- [ ] Bank reconciliation integration
- [ ] Automated daily email reports
- [ ] Cash flow forecasting
- [ ] Multi-location support
- [ ] Currency conversion for foreign vendors
