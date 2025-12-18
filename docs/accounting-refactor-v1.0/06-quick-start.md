# Quick Start Guide - Accounting System Refactor

## 🚀 Deployment Steps

### 1. Deploy Database Migrations

```bash
cd /home/fortune/Desktop/py_project/zohra-rms-v2-main

# Run the migrations
node deploy_accounting_migrations.js
```

**This will**:
- ✅ Create `payment_modes` configuration table
- ✅ Link expense categories to GL accounts
- ✅ Add daily closure tracking fields
- ✅ Setup financial period locking with triggers
- ✅ Create periods for last 12 months

---

### 2. Restart Server

```bash
cd server
npm restart

# Or if using PM2
pm2 restart zohra-rms
```

---

### 3. Verify Migrations

```bash
# Check payment modes
psql -d zohra_rms -c "SELECT * FROM payment_modes;"

# Check category mappings
psql -d zohra_rms -c "SELECT id, name, type, account_code FROM transaction_categories;"

# Check financial periods
psql -d zohra_rms -c "SELECT * FROM financial_periods ORDER BY start_date DESC LIMIT 5;"
```

---

## 🧪 Testing

### Test 1: Expense Entry (with validation)

**Using Postman/cURL**:
```bash
curl -X POST http://localhost:5000/api/finance/expense \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Test Grocery Expense",
    "amount": 500,
    "category_id": 1,
    "payment_mode": "cash",
    "paid_by": "Manager",
    "date": "2025-12-18"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "journal_entry_id": "uuid-here",
  "message": "Expense recorded successfully"
}
```

**Verify in Database**:
```sql
-- Check journal entry created
SELECT * FROM journal_entries WHERE description = 'Test Grocery Expense';

-- Check ledger lines (should have 2 lines, Dr = Cr)
SELECT ll.*, ca.name as account_name
FROM ledger_lines ll
JOIN chart_of_accounts ca ON ll.account_code = ca.code
WHERE journal_entry_id = 'YOUR_JE_ID';
```

---

### Test 2: Day Closure

**Close a day**:
```bash
curl -X POST http://localhost:5000/api/finance/daily-balance/close \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-12-17",
    "type": "Counter",
    "actualClosingBalance": 9800
  }'
```

**Try to add expense on closed day** (should fail):
```bash
curl -X POST http://localhost:5000/api/finance/expense \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Backdated Expense",
    "amount": 100,
    "category_id": 1,
    "payment_mode": "cash",
    "paid_by": "Manager",
    "date": "2025-12-17"
  }'
```

**Expected**: Error message "Cannot add expense: 2025-12-17 is closed"

---

### Test 3: Payment Modes API

```bash
curl http://localhost:5000/api/finance/payment-modes \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: List of payment modes with account mappings

---

### Test 4: Vendor Payment (No Duplication)

**Make a vendor payment**:
```bash
curl -X POST http://localhost:5000/api/vendors/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": 1,
    "amount": 1000,
    "paymentMode": "Cash",
    "notes": "Test Payment",
    "paidBy": "Owner"
  }'
```

**Verify NO duplication**:
```sql
-- Check journal entry exists
SELECT COUNT(*) FROM journal_entries 
WHERE description LIKE 'Vendor Payment%' 
AND transaction_date = CURRENT_DATE;

-- Check transactions table (should NOT have vendor payment anymore)
SELECT COUNT(*) FROM transactions 
WHERE type = 'Expense' 
AND vendor_id = 1 
AND date = CURRENT_DATE;
```

The second query should return **0** (no duplication for new payments).

---

## ✅ Success Criteria

After deployment and testing, verify:

- [x] Expense entry creates journal  with balanced debits/credits
- [x] Closed days reject cash transactions
- [x] Payment modes API returns configured modes
- [x] Vendor payments DON'T duplicate to transactions table
- [x] Financial periods exist for current month
- [x] Cannot create journal entries in locked periods

---

## 🔍 Troubleshooting

### Issue: Migration fails with "permission denied"
**Solution**: Ensure database user has CREATE TABLE permissions

### Issue: "payment_modes table not found"
**Solution**: Migrations didn't run. Check `deploy_accounting_migrations.js` output for errors

### Issue: Expense fails with "Category not mapped to GL account"
**Solution**: Run migration 031 again, or manually set account_code:
```sql
UPDATE transaction_categories 
SET account_code = 6900 
WHERE id = YOUR_CATEGORY_ID;
```

### Issue: Cannot close day - "daily balance not found"
**Solution**: Day record needs to be initialized:
```sql
INSERT INTO daily_balances (date, type, opening_balance, closing_balance, status)
VALUES ('2025-12-18', 'Counter', 0, 0, 'Open');
```

---

## 📊 Next Steps

1. **Test thoroughly** with your team
2. **Update frontend** to use new endpoints
3. **Implement advance journal entries** (payroll module)
4. **Create reports** from journal entries (Trial Balance, P&L)

---

**Questions?** Review `implementation_summary.md` for full details.
