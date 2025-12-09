# Ledger Calculation Logic Module - Detailed Walkthrough

## Overview
Advanced ledger calculation utilities providing running balance tracking, category aggregation, payment history analysis, and aging reports for vendor management.

---

## Module Structure

**File:** `server/src/modules/vendors/ledger.service.js`

**Functions:** 6 calculation utilities
**Dependencies:** PostgreSQL database
**Integration:** Vendor payment system, reporting

---

## Function 1: calculateRunningBalance

### Purpose
Calculate transaction-by-transaction running balance for a vendor

### Signature
```javascript
calculateRunningBalance(vendorId, startDate = null, endDate = null)
```

### Parameters
- `vendorId` (INTEGER) - Vendor ID
- `startDate` (DATE, optional) - Filter start date
- `endDate` (DATE, optional) - Filter end date

### Logic Flow
```
1. Query all transactions for vendor (ordered by date ASC)
2. Get opening balance from suppliers table
3. Iterate through transactions:
   - Add amount to running balance
   - Store balance after each transaction
4. Return opening balance, transactions array, closing balance
```

### Code Example
```javascript
const result = await ledgerService.calculateRunningBalance(1, '2025-12-01', '2025-12-09');

// Result structure:
{
    opening_balance: 0,
    transactions: [
        {
            id: 1,
            date: '2025-12-01',
            transaction_type: 'Bill',
            amount: 10000,
            running_balance: 10000
        },
        {
            id: 2,
            date: '2025-12-05',
            transaction_type: 'Payment',
            amount: -5000,
            running_balance: 5000
        }
    ],
    closing_balance: 5000
}
```

### API Endpoint
```
GET /api/vendors/:id/running-balance?startDate=2025-12-01&endDate=2025-12-09
```

---

## Function 2: getOutstandingAmount

### Purpose
Calculate current outstanding balance for a vendor

### Signature
```javascript
getOutstandingAmount(vendorId)
```

### Logic
```sql
opening_balance + SUM(all transactions) = outstanding_amount
```

### Code Example
```javascript
const result = await ledgerService.getOutstandingAmount(1);

// Result:
{
    vendor_id: 1,
    opening_balance: 0,
    total_transactions: 5000,
    outstanding_amount: 5000
}
```

---

## Function 3: getCategoryAggregation

### Purpose
Aggregate vendor balances by category

### Signature
```javascript
getCategoryAggregation(categoryId = null, startDate = null, endDate = null)
```

### Parameters
- `categoryId` (INTEGER, optional) - Filter by category
- `startDate` (DATE, optional) - Filter start date
- `endDate` (DATE, optional) - Filter end date

### Logic Flow
```
1. Join vendor_categories, suppliers, vendor_ledger
2. Group by category
3. Calculate:
   - Vendor count per category
   - Total opening balance
   - Total transactions
   - Outstanding balance
4. Order by total_transactions DESC
```

### Code Example
```javascript
const result = await ledgerService.getCategoryAggregation();

// Result:
[
    {
        category_id: 1,
        category_name: 'COGS - Nonveg',
        vendor_count: 5,
        total_opening_balance: 0,
        total_transactions: 50000,
        outstanding_balance: 50000
    },
    {
        category_id: 2,
        category_name: 'COGS - Dairy',
        vendor_count: 3,
        total_opening_balance: 0,
        total_transactions: 20000,
        outstanding_balance: 20000
    }
]
```

### API Endpoint
```
GET /api/vendors/reports/category-aggregation?categoryId=1&startDate=2025-12-01
```

---

## Function 4: getPaymentHistory

### Purpose
Track payment history with filtering and aggregation

### Signature
```javascript
getPaymentHistory(vendorId = null, startDate = null, endDate = null, paymentMode = null)
```

### Parameters
- `vendorId` (INTEGER, optional) - Filter by vendor
- `startDate` (DATE, optional) - Filter start date
- `endDate` (DATE, optional) - Filter end date
- `paymentMode` (VARCHAR, optional) - Filter by payment mode

### Logic Flow
```
1. Query vendor_payments with filters
2. Calculate totals:
   - Total payment count
   - Total amount
   - Breakdown by payment mode
3. Return payments array + summary
```

### Code Example
```javascript
const result = await ledgerService.getPaymentHistory(1, '2025-12-01', '2025-12-09');

// Result:
{
    payments: [
        {
            id: 123,
            vendor_id: 1,
            vendor_name: 'ABC Suppliers',
            payment_date: '2025-12-09',
            amount: 5000,
            payment_mode: 'Cash',
            reference_number: 'INV-001',
            notes: 'Payment for chicken',
            paid_by: 'John Doe'
        }
    ],
    summary: {
        total_payments: 3,
        total_amount: 13000,
        by_mode: {
            'Cash': { count: 2, total: 10000 },
            'UPI': { count: 1, total: 3000 }
        }
    }
}
```

### API Endpoint
```
GET /api/vendors/reports/payment-history?vendorId=1&paymentMode=Cash
```

---

## Function 5: getDateRangeReport

### Purpose
Generate period-based transaction report

### Signature
```javascript
getDateRangeReport(startDate, endDate, categoryId = null)
```

### Parameters
- `startDate` (DATE, required) - Report start date
- `endDate` (DATE, required) - Report end date
- `categoryId` (INTEGER, optional) - Filter by category

### Logic Flow
```
1. Query vendor_ledger for date range
2. Group by date and transaction_type
3. Calculate daily:
   - Total bills
   - Total payments
   - Vendor count
   - Transaction count
4. Aggregate totals for entire period
```

### Code Example
```javascript
const result = await ledgerService.getDateRangeReport('2025-12-01', '2025-12-09');

// Result:
{
    date_range: {
        start: '2025-12-01',
        end: '2025-12-09'
    },
    daily_breakdown: [
        {
            date: '2025-12-09',
            transaction_type: 'Bill',
            total_bills: 15000,
            total_payments: 0,
            vendor_count: 2,
            transaction_count: 3
        },
        {
            date: '2025-12-09',
            transaction_type: 'Payment',
            total_bills: 0,
            total_payments: 13000,
            vendor_count: 2,
            transaction_count: 2
        }
    ],
    totals: {
        total_bills: 15000,
        total_payments: 13000,
        net_outstanding: 2000,
        transaction_count: 5
    }
}
```

### API Endpoint
```
GET /api/vendors/reports/date-range?startDate=2025-12-01&endDate=2025-12-09&categoryId=1
```

---

## Function 6: getAgingReport

### Purpose
Analyze how long bills have been outstanding

### Signature
```javascript
getAgingReport()
```

### Logic Flow
```
1. Query vendors with outstanding balance > 0
2. Find oldest bill date per vendor
3. Calculate days outstanding (CURRENT_DATE - oldest_bill_date)
4. Categorize into aging buckets:
   - 0-30 days
   - 30-60 days
   - 60-90 days
   - >90 days
5. Order by days_outstanding DESC
```

### Code Example
```javascript
const result = await ledgerService.getAgingReport();

// Result:
[
    {
        vendor_id: 1,
        vendor_name: 'ABC Suppliers',
        outstanding_balance: 28000,
        oldest_bill_date: '2025-11-15',
        latest_transaction_date: '2025-12-09',
        days_outstanding: 24,
        aging_category: '0-30 days'
    },
    {
        vendor_id: 2,
        vendor_name: 'XYZ Traders',
        outstanding_balance: 50000,
        oldest_bill_date: '2025-09-01',
        latest_transaction_date: '2025-12-05',
        days_outstanding: 99,
        aging_category: '>90 days'
    }
]
```

### API Endpoint
```
GET /api/vendors/reports/aging
```

---

## Integration with Routes

**File:** `server/src/modules/vendors/routes.js`

All ledger calculation functions are exposed as API endpoints:

```javascript
// Running balance
router.get('/:id/running-balance', async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await ledgerService.calculateRunningBalance(
        req.params.id, startDate, endDate
    );
    res.json(result);
});

// Category aggregation
router.get('/reports/category-aggregation', async (req, res) => {
    const { categoryId, startDate, endDate } = req.query;
    const result = await ledgerService.getCategoryAggregation(
        categoryId, startDate, endDate
    );
    res.json(result);
});

// Payment history
router.get('/reports/payment-history', async (req, res) => {
    const { vendorId, startDate, endDate, paymentMode } = req.query;
    const result = await ledgerService.getPaymentHistory(
        vendorId, startDate, endDate, paymentMode
    );
    res.json(result);
});

// Date range report
router.get('/reports/date-range', async (req, res) => {
    const { startDate, endDate, categoryId } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Dates required' });
    }
    const result = await ledgerService.getDateRangeReport(
        startDate, endDate, categoryId
    );
    res.json(result);
});

// Aging report
router.get('/reports/aging', async (req, res) => {
    const result = await ledgerService.getAgingReport();
    res.json(result);
});
```

---

## Testing

### Test Results (from test_phase4_7.js)

```
✓ Running balance: ₹2,000 (4 transactions)
✓ Outstanding calculation: accurate
✓ Category aggregation: 6 categories tracked
✓ Payment history: 2 payments, ₹13,000
✓ Date range: ₹15,000 bills, ₹13,000 paid
✓ Aging: 1 vendor, 0-30 days
```

---

## Use Cases

### Use Case 1: Vendor Reconciliation
```javascript
// Get running balance to reconcile with vendor statement
const balance = await ledgerService.calculateRunningBalance(
    vendorId, '2025-12-01', '2025-12-31'
);

// Compare closing_balance with vendor's statement
```

### Use Case 2: Category Budget Analysis
```javascript
// Get category-wise spending
const categories = await ledgerService.getCategoryAggregation(
    null, '2025-12-01', '2025-12-31'
);

// Analyze which categories exceeded budget
```

### Use Case 3: Payment Mode Analysis
```javascript
// Track cash vs digital payments
const history = await ledgerService.getPaymentHistory(
    null, '2025-12-01', '2025-12-31'
);

// Analyze summary.by_mode for cash flow planning
```

### Use Case 4: Overdue Bill Management
```javascript
// Find vendors with old outstanding bills
const aging = await ledgerService.getAgingReport();

// Prioritize payments for >90 days category
```

---

## Performance Considerations

**Indexes Used:**
- `idx_vendor_ledger_supplier` - Fast vendor filtering
- `idx_vendor_ledger_date` - Date range queries
- `idx_vendor_ledger_type` - Transaction type filtering

**Optimization Tips:**
- Use date filters to limit result set
- Category filtering reduces JOIN complexity
- Aging report uses MIN/MAX for efficiency

---

## Error Handling

All functions throw descriptive errors:

```javascript
try {
    const result = await ledgerService.calculateRunningBalance(999);
} catch (err) {
    // err.message: "Running balance calculation failed: Vendor not found"
}
```

---

## Future Enhancements

- [ ] Export reports to Excel/PDF
- [ ] Scheduled aging report emails
- [ ] Predictive analytics for payment patterns
- [ ] Multi-currency support
- [ ] Vendor performance scoring
