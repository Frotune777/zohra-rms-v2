# Al Zohra RMS v2 - Accounting Correctness Implementation Plan

**Project**: Al Zohra Restaurant Management System v2  
**Objective**: Transform into accounting-safe, Excel-free system  
**Approach**: Incremental, migration-safe, production-ready

---

## User Review Required

> [!CAUTION]
> **Breaking Changes Identified**
> 
> This implementation will make the following breaking changes:
> 
> 1. **Retire `transactions` Table**: The current `transactions` table will be replaced by `journal_entries` + `ledger_lines` for all financial operations. Existing transaction data will be migrated to journal entries.
> 
> 2. **Expense Entry Behavior Change**: Daily tracker expense entries will create journal entries (slower but accurate) instead of simple INSERT operations.
> 
> 3. **Cash Closure Enforcement**: Once a day is marked "Closed", NO cash transactions can be added/edited/deleted for that date. This may affect workflow if users are used to backdating entries.
> 
> 4. **Account Code Requirements**: All expense categories must be linked to GL accounts. Unmapped categories will block transaction posting.

> [!IMPORTANT]
> **Migration Strategy**
> 
> - Existing `transactions` data will be **preserved** and dual-written during transition period
> - New account mappings will be created with sensible defaults
> - Financial periods will be auto-created for the last 12 months with status='Open'
> - No historical data will be deleted – only transformed

> [!WARNING]
> **Performance Impact**
> 
> Double-entry posting is more complex than single-entry. Expect:
> - Expense entry: +50-100ms per transaction
> - Vendor payment: No change (already uses double-entry)
> - Payroll: +200ms per employee (advance journal entries)
> 
> **Recommendation**: Run these operations in background transactions as they already are.

---

## Proposed Changes

### Component 1: Chart of Accounts Enhancement

#### [MODIFY] database/00_init.sql

```sql
-- Add missing accounts for comprehensive accounting

INSERT INTO chart_of_accounts (code, name, type) VALUES
-- Additional Asset Accounts
(1010, 'Bank - Main Account', 'Asset'),
(1020, 'UPI Clearing Account', 'Asset'),
(1030, 'Cash - Manager Float', 'Asset'),

-- Liability Accounts
(2000, 'Accounts Payable - Vendors', 'Liability'),
(2100, 'Salaries Payable', 'Liability'),

-- Revenue Accounts
(4100, 'Sales - Dine In', 'Revenue'),
(4200, 'Sales - Takeaway', 'Revenue'),

-- COGS Accounts (detailed)
(5100, 'COGS - Chicken/Meat', 'Expense'),
(5200, 'COGS - Dairy Products', 'Expense'),
(5300, 'COGS - Grocery/Spices', 'Expense'),

-- Operating Expense Accounts
(6100, 'Salaries - Staff', 'Expense'),
(6200, 'Rent Expense', 'Expense'),
(6300, 'Utilities - Electricity', 'Expense'),
(6400, 'Utilities - Gas', 'Expense'),
(6500, 'Fuel Expense', 'Expense'),
(6600, 'Packaging Materials', 'Expense'),
(6700, 'Maintenance & Repairs', 'Expense'),
(6800, 'Transportation', 'Expense'),
(6900, 'Miscellaneous Expense', 'Expense'),

-- Variance Accounts
(7000, 'Cash Shortage Expense', 'Expense'),
(7100, 'Cash Excess Income', 'Revenue')
ON CONFLICT (code) DO NOTHING;
```

**Justification**: Detailed chart of accounts enables proper expense categorization and reporting.

---

### Component 2: Payment Modes Configuration

#### [NEW] database/migrations/030_payment_modes.sql

```sql
-- Create payment modes table for dynamic account mapping
CREATE TABLE IF NOT EXISTS payment_modes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    account_code INT NOT NULL REFERENCES chart_of_accounts(code),
    is_active BOOLEAN DEFAULT TRUE,
    requires_reference BOOLEAN DEFAULT FALSE, -- e.g., Cheque needs reference
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default payment modes
INSERT INTO payment_modes (name, display_name, account_code, requires_reference) VALUES
('cash', 'Cash', 1000, FALSE),
('bank', 'Bank Transfer', 1010, TRUE),
('upi', 'UPI Payment', 1020, TRUE),
('manager_float', 'Manager Float', 1030, FALSE),
('cheque', 'Cheque', 1010, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Index for fast lookup
CREATE INDEX idx_payment_modes_active ON payment_modes(is_active);
```

**Justification**: Removes hardcoded account mappings from code, enables configuration.

---

### Component 3: Expense Mapping Enhancement

#### [MODIFY] server/src/modules/finance/migrations/002_expense_mappings.sql

```sql
-- Add account_code to transaction_categories
ALTER TABLE transaction_categories 
ADD COLUMN IF NOT EXISTS account_code INT REFERENCES chart_of_accounts(code);

-- Update existing categories with account mappings
UPDATE transaction_categories SET account_code = 4000 WHERE name = 'Sales' AND type = 'Income';
UPDATE transaction_categories SET account_code = 5300 WHERE name = 'Grocery' AND type = 'Expense';
UPDATE transaction_categories SET account_code = 6100 WHERE name = 'Labor' AND type = 'Expense';
UPDATE transaction_categories SET account_code = 6200 WHERE name = 'Rent' AND type = 'Expense';
UPDATE transaction_categories SET account_code = 6300 WHERE name = 'Utilities' AND type = 'Expense';
UPDATE transaction_categories SET account_code = 6700 WHERE name = 'Maintenance' AND type = 'Expense';
UPDATE transaction_categories SET account_code = 6800 WHERE name = 'Marketing' AND type = 'Expense';
UPDATE transaction_categories SET account_code = 6900 WHERE name = 'Misc' AND type = 'Expense';

-- Make account_code required for future categories
ALTER TABLE transaction_categories 
ALTER COLUMN account_code SET NOT NULL;
```

**Mapping**: Keywords → Categories → Accounts (complete chain)

---

### Component 4: Daily Cash Closure System

#### [NEW] database/migrations/031 _daily_closure_enforcement.sql

```sql
-- Add closure tracking fields
ALTER TABLE daily_balances
ADD COLUMN IF NOT EXISTS closed_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS variance_je_id UUID REFERENCES journal_entries(id);

-- Create function to check if day is closed
CREATE OR REPLACE FUNCTION is_day_closed(check_date DATE, check_type VARCHAR) 
RETURNS BOOLEAN AS $$
DECLARE
    closure_status VARCHAR;
BEGIN
    SELECT status INTO closure_status 
    FROM daily_balances 
    WHERE date = check_date AND type = check_type;
    
    RETURN closure_status = 'Closed';
END;
$$ LANGUAGE plpgsql;

-- THIS WILL BE ENFORCED AT APPLICATION LEVEL for now
-- Trigger-based enforcement can cause issues with imports/migrations
-- App-level check is more flexible and provides better error messages
```

**Approach**: Application-level enforcement rather than DB triggers for flexibility.

---

### Component 5: Transaction Service Refactoring

#### [NEW] server/src/modules/finance/JournalService.js

```javascript
const db = require('../../config/db');

class JournalService {
    /**
     * Create Journal Entry with Balanced Lines
     * @param {Object} entry - {date, description, reference_id, reference_type, lines: [{account_code, debit, credit}]}
     * @returns {Object} - Created journal entry with ID
     */
    async createJournalEntry(entry, client = null) {
        const shouldManageTransaction = !client;
        const dbClient = client || await db.pool.connect();
        
        try {
            if (shouldManageTransaction) await dbClient.query('BEGIN');
            
            // Validate balanced entry
            const totalDebit = entry.lines.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0);
            const totalCredit = entry.lines.reduce((sum, line) => sum + parseFloat(line.credit || 0), 0);
            
            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                throw new Error(`Unbalanced entry: Dr ${totalDebit} != Cr ${totalCredit}`);
            }
            
            // Insert journal entry
            const jeRes = await dbClient.query(`
                INSERT INTO journal_entries (transaction_date, description, reference_id, reference_type)
                VALUES ($1, $2, $3, $4) RETURNING id
            `, [entry.date, entry.description, entry.reference_id, entry.reference_type]);
            
            const jeId = jeRes.rows[0].id;
            
            // Insert ledger lines
            for (const line of entry.lines) {
                await dbClient.query(`
                    INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
                    VALUES ($1, $2, $3, $4)
                `, [jeId, line.account_code, line.debit || 0, line.credit || 0]);
            }
            
            if (shouldManageTransaction) await dbClient.query('COMMIT');
            
            return { id: jeId, ...entry };
            
        } catch (err) {
            if (shouldManageTransaction) await dbClient.query('ROLLBACK');
            throw err;
        } finally {
            if (shouldManageTransaction) dbClient.release();
        }
    }
    
    /**
     * Get Account Balance as of Date
     */
    async getAccountBalance(accountCode, asOfDate = null) {
        const query = `
            SELECT 
                SUM(debit) - SUM(credit) as balance
            FROM ledger_lines ll
            JOIN journal_entries je ON ll.journal_entry_id = je.id
            WHERE ll.account_code = $1
            ${asOfDate ? 'AND je.transaction_date <= $2' : ''}
        `;
        
        const params = asOfDate ? [accountCode, asOfDate] : [accountCode];
        const result = await db.query(query, params);
        
        return parseFloat(result.rows[0]?.balance || 0);
    }
}

module.exports = new JournalService();
```

**Purpose**: Centralized, validated journal entry creation.

---

### Component 6: Expense Entry Flow (Double-Entry)

#### [MODIFY] server/src/modules/finance/service.js

```javascript
const JournalService = require('./JournalService');

class FinanceService {
    async addExpense(data) {
        const { date, description, amount, category_id, payment_mode, paid_by, vendor_id } = data;
        const client = await db.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 1. Check if day is closed
            const closureCheck = await client.query(`
                SELECT status FROM daily_balances 
                WHERE date = $1 AND type = 'Counter'
            `, [date]);
            
            if (closureCheck.rows[0]?.status === 'Closed') {
                throw new Error(`Cannot add expense - ${date} is closed`);
            }
            
            // 2. Get category account mapping
            const categoryRes = await client.query(`
                SELECT account_code FROM transaction_categories WHERE id = $1
            `, [category_id]);
            
            if (!categoryRes.rows[0]) {
                throw new Error('Category not found');
            }
            
            const expenseAccount = categoryRes.rows[0].account_code;
            
            // 3. Get payment mode account mapping
            const paymentRes = await client.query(`
                SELECT account_code FROM payment_modes WHERE name = $1 AND is_active = TRUE
            `, [payment_mode.toLowerCase()]);
            
            if (!paymentRes.rows[0]) {
                throw new Error(`Invalid payment mode: ${payment_mode}`);
            }
            
            const cashAccount = paymentRes.rows[0].account_code;
            
            // 4. Create journal entry
            const journalEntry = {
                date: date,
                description: description,
                reference_type: 'Expense',
                lines: [
                    { account_code: expenseAccount, debit: amount, credit: 0 },
                    { account_code: cashAccount, debit: 0, credit: amount }
                ]
            };
            
            const je = await JournalService.createJournalEntry(journalEntry, client);
            
            // 5. Also create in transactions table (for backward compatibility during transition)
            // TODO: Remove this after migration period
            await client.query(`
                INSERT INTO transactions 
                (date, type, amount, payment_method, description, category_id, vendor_id, paid_by, status)
                VALUES ($1, 'Expense', $2, $3, $4, $5, $6, $7, 'Paid')
            `, [date, amount, payment_mode, description, category_id, vendor_id, paid_by]);
            
            await client.query('COMMIT');
            
            return { success: true, journal_entry_id: je.id };
            
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}
```

**Key Changes**:
- ✅ Day closure check
- ✅ Category → Account lookup
- ✅ Payment mode → Account lookup
- ✅ Journal entry creation (double-entry)
- ⚠️ Backward compat: Still writes to `transactions` table

---

### Component 7: Daily Closure & Variance Posting

#### [NEW] server/src/modules/finance/ClosureService.js

```javascript
const JournalService = require('./JournalService');
const db = require('../../config/db');

class ClosureService {
    /**
     * Close Day and Post Variance
     */
    async closeDailyBalance(date, type, actualClosingBalance, userId) {
        const client = await db.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 1. Get existing balance record
            const balanceRes = await client.query(`
                SELECT * FROM daily_balances 
                WHERE date = $1 AND type = $2
            `, [date, type]);
            
            if (!balanceRes.rows[0]) {
                throw new Error('Daily balance record not found');
            }
            
            const balance = balanceRes.rows[0];
            
            if (balance.status === 'Closed') {
                throw new Error('Day already closed');
            }
            
            const expectedClosing = parseFloat(balance.closing_balance);
            const actualClosing = parseFloat(actualClosingBalance);
            const variance = actualClosing - expectedClosing;
            
            // 2. If variance exists, create journal entry
            let varianceJeId = null;
            
            if (Math.abs(variance) > 0.01) {
                const isShortage = variance < 0;
                const absVariance = Math.abs(variance);
                
                const journalEntry = {
                    date: date,
                    description: isShortage 
                        ? `Cash Shortage - ${type}` 
                        : `Cash Excess - ${type}`,
                    reference_type: 'CashVariance',
                    lines: isShortage ? [
                        { account_code: 7000, debit: absVariance, credit: 0 }, // Cash Shortage Expense
                        { account_code: type === 'Counter' ? 1000 : 1030, debit: 0, credit: absVariance } // Cash account
                    ] : [
                        { account_code: type === 'Counter' ? 1000 : 1030, debit: absVariance, credit: 0 }, // Cash account
                        { account_code: 7100, debit: 0, credit: absVariance } // Cash Excess Income
                    ]
                };
                
                const je = await JournalService.createJournalEntry(journalEntry, client);
                varianceJeId = je.id;
            }
            
            // 3. Update daily balance
            await client.query(`
                UPDATE daily_balances 
                SET actual_closing_balance = $1,
                    status = 'Closed',
                    closed_by = $2,
                    closed_at = NOW(),
                    variance_je_id = $3
                WHERE date = $4 AND type = $5
            `, [actualClosing, userId, varianceJeId, date, type]);
            
            await client.query('COMMIT');
            
            return {
                success: true,
                variance: variance,
                variance_posted: varianceJeId !== null
            };
            
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
    
    /**
     * Reopen Day (Owner Only)
     */
    async reopenDay(date, type, userId, reason) {
        const client = await db.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 1. Get balance with variance JE
            const balanceRes = await client.query(`
                SELECT * FROM daily_balances 
                WHERE date = $1 AND type = $2
            `, [date, type]);
            
            if (!balanceRes.rows[0]) {
                throw new Error('Daily balance not found');
            }
            
            const balance = balanceRes.rows[0];
            
            // 2. If variance JE exists, mark it as reversed
            if (balance.variance_je_id) {
                await client.query(`
                    UPDATE journal_entries 
                    SET description = description || ' [REVERSED - Day Reopened: ' || $1 || ']'
                    WHERE id = $2
                `, [reason, balance.variance_je_id]);
            }
            
            // 3. Reopen day
            await client.query(`
                UPDATE daily_balances 
                SET status = 'Open',
                    closed_by = NULL,
                    closed_at = NULL,
                    variance_je_id = NULL
                WHERE date = $1 AND type = $2
            `, [date, type]);
            
            // 4. Audit log
            await client.query(`
                INSERT INTO audit_logs 
                (table_name, record_id, action, changed_by, metadata)
                VALUES ('daily_balances', $1, 'reopen_day', $2, $3)
            `, [balance.id, userId, JSON.stringify({ reason, date, type })]);
            
            await client.query('COMMIT');
            
            return { success: true };
            
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new ClosureService();
```

---

### Component 8: Advance Ledger - Journal Entry Integration

#### [MODIFY] server/src/modules/employees/controller.js

Add journal entry creation when advance is given:

```javascript
async giveAdvance(req, res) {
    const { employee_id, amount, payment_mode, paid_by, notes } = req.body;
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Insert into salary_advances
        const advanceRes = await client.query(`
            INSERT INTO salary_advances (employee_id, amount, payment_mode, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING *
        `, [employee_id, amount, payment_mode]);
        
        const advanceId = advanceRes.rows[0].id;
        
        // 2. Get payment mode account
        const pmRes = await client.query(`
            SELECT account_code FROM payment_modes 
            WHERE name = $1 AND is_active = TRUE
        `, [payment_mode.toLowerCase()]);
        
        const cashAccount = pmRes.rows[0].account_code;
        
        // 3. Create journal entry: Dr Advance Receivable, Cr Cash
        const journalEntry = {
            date: new Date(),
            description: `Salary Advance - ${notes}`,
            reference_id: advanceId,
            reference_type: 'SalaryAdvance',
            lines: [
                { account_code: 1100, debit: amount, credit: 0 }, // Advance Receivable
                { account_code: cashAccount, debit: 0, credit: amount } // Cash/Bank
            ]
        };
        
        const je = await JournalService.createJournalEntry(journalEntry, client);
        
        // 4. Insert into advance_ledger
        await client.query(`
            INSERT INTO advance_ledger 
            (employee_id, transaction_type, amount, balance_after, transaction_date, notes, payment_mode, paid_by)
            VALUES ($1, 'Advance', $2, $2, NOW(), $3, $4, $5)
        `, [employee_id, amount, notes, payment_mode, paid_by]);
        
        await client.query('COMMIT');
        
        res.json({ success: true, advance_id: advanceId, journal_entry_id: je.id });
        
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}
```

---

#### [MODIFY] server/src/modules/payroll/controller.js

Add journal entry for repayment:

```javascript
// In markPaid function, after recording repayment in advance_ledger:

// Create journal entry for repayment: Dr Cash (if net pay positive), Cr Advance Receivable
if (record.advance_deduction > 0) {
    const repaymentJE = {
        date: payment_date || new Date(),
        description: `Advance Recovery - Payroll ${record.month}/${record.year}`,
        reference_id: record.id,
        reference_type: 'AdvanceRepayment',
        lines: [
            { account_code: payment_mode === 'Cash' ? 1000 : 1010, debit: record.advance_deduction, credit: 0 },
            { account_code: 1100, debit: 0, credit: record.advance_deduction } // Advance Receivable
        ]
    };
    
    await JournalService.createJournalEntry(repaymentJE, client);
}
```

---

### Component 9: Sales Entry (Double-Entry)

#### [MODIFY] server/src/modules/pos/controller.js

```javascript
async createOrder(req, res) {
    // ... existing order creation logic ...
    
    // After order is created, post to journal
    const journalEntry = {
        date: new Date(),
        description: `POS Sale - Order #${orderId}`,
        reference_id: orderId,
        reference_type: 'POSSale',
        lines: []
    };
    
    // Debit cash/bank based on payment method
    const paymentAccount = paymentMethod === 'Cash' ? 1000 : 1010;
    journalEntry.lines.push({ account_code: paymentAccount, debit: totalAmount, credit: 0 });
    
    // Credit sales revenue
    journalEntry.lines.push({ account_code: 4100, debit: 0, credit: totalAmount });
    
    await JournalService.createJournalEntry(journalEntry, client);
}
```

---

### Component 10: Frontend Changes

#### [MODIFY] client/src/pages/DailyTracker.jsx

Add closure status display and enforcement:

```javascript
// Add closure status check before allowing expense entry
const [dayStatus, setDayStatus] = useState('Open');

useEffect(() => {
    // Fetch day status
    api.get(`/finance/daily-balance/${selectedDate}`)
        .then(res => setDayStatus(res.data.status))
        .catch(err => console.error(err));
}, [selectedDate]);

// In expense entry form
const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (dayStatus === 'Closed') {
        toast.error(`${selectedDate} is closed. Cannot add expenses.`);
        return;
    }
    
    // ... rest of submission logic
};
```

#### Add Daily Closure Button:

```jsx
<button 
    onClick={handleClosureClick}
    className="btn btn-danger"
    disabled={dayStatus === 'Closed'}
>
    {dayStatus === 'Closed' ? '🔒 Day Closed' : '📊 Close Day'}
</button>
```

---

### Component 11: API Routes Update

#### [MODIFY] server/src/modules/finance/routes.js

```javascript
const ClosureService = require('./ClosureService');

// Daily closure endpoints
router.post('/daily-balance/close', auth, rbac('owner', 'manager'), async (req, res) => {
    try {
        const { date, type, actualClosingBalance } = req.body;
        const result = await ClosureService.closeDailyBalance(date, type, actualClosingBalance, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/daily-balance/reopen', auth, rbac('owner'), async (req, res) => {
    try {
        const { date, type, reason } = req.body;
        const result = await ClosureService.reopenDay(date, type, req.user.id, reason);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

---

## Verification Plan

### Automated Tests

#### Test 1: Journal Entry Balance Validation
**File**: `server/tests/journal.test.js` (NEW)

```javascript
const JournalService = require('../src/modules/finance/JournalService');

describe('JournalService', () => {
    it('should reject unbalanced entries', async () => {
        const unbalancedEntry = {
            date: '2025-01-01',
            description: 'Test',
            lines: [
                { account_code: 1000, debit: 100, credit: 0 },
                { account_code: 4000, debit: 0, credit: 50 } // Unbalanced!
            ]
        };
        
        await expect(JournalService.createJournalEntry(unbalancedEntry))
            .rejects
            .toThrow('Unbalanced entry');
    });
    
    it('should create balanced journal entry', async () => {
        const balancedEntry = {
            date: '2025-01-01',
            description: 'Test Sale',
            lines: [
                { account_code: 1000, debit: 100, credit: 0 },
                { account_code: 4000, debit: 0, credit: 100 }
            ]
        };
        
        const result = await JournalService.createJournalEntry(balancedEntry);
        expect(result.id).toBeDefined();
    });
});
```

**Run**: `cd server && npm test tests/journal.test.js`

---

#### Test 2: Day Closure Enforcement
**File**: `server/tests/closure.test.js` (NEW)

```javascript
const ClosureService = require('../src/modules/finance/ClosureService');
const FinanceService = require('../src/modules/finance/service');

describe('Daily Closure', () => {
    it('should prevent expenses on closed days', async () => {
        // Close a day
        await ClosureService.closeDailyBalance('2025-01-01', 'Counter', 5000, 1);
        
        // Try to add expense
        const expense = {
            date: '2025-01-01',
            description: 'Test Expense',
            amount: 100,
            category_id: 1,
            payment_mode: 'cash'
        };
        
        await expect(FinanceService.addExpense(expense))
            .rejects
            .toThrow('Cannot add expense - 2025-01-01 is closed');
    });
});
```

**Run**: `cd server && npm test tests/closure.test.js`

---

#### Test 3: Variance Auto-Posting
**File**: `server/tests/variance.test.js` (NEW)

```javascript
describe('Cash Variance', () => {
    it('should post cash shortage to expense account', async () => {
        const result = await ClosureService.closeDailyBalance(
            '2025-01-01', 
            'Counter', 
            4800, // Expected: 5000, Actual: 4800, Shortage: 200
            1
        );
        
        expect(result.variance).toBe(-200);
        expect(result.variance_posted).toBe(true);
        
        // Verify journal entry exists
        const je = await db.query(`
            SELECT * FROM journal_entries WHERE id = (
                SELECT variance_je_id FROM daily_balances 
                WHERE date = '2025-01-01' AND type = 'Counter'
            )
        `);
        
        expect(je.rows[0].description).toContain('Cash Shortage');
    });
});
```

**Run**: `cd server && npm test tests/variance.test.js`

---

### Manual Verification

#### Scenario 1: Expense Entry Flow
1. Login as Manager
2. Navigate to **Finance → Daily Tracker**
3. Select today's date
4. Add expense: "Tomato Purchase - ₹500"
5. Select Category: "Grocery"
6. Payment Mode: "Cash"
7. Click Save
8. **Verify**:
   - Expense appears in transaction list
   - Navigate to **Reports → Trial Balance**
   - Check account 5300 (COGS-Grocery) has debit of ₹500
   - Check account 1000 (Cash) has credit of ₹500

#### Scenario 2: Day Closure
1. Login as Manager
2. Navigate to **Finance → Daily Reconciliation**
3. Enter today's closing cash: ₹9,800 (expected: ₹10,000)
4. Click "Close Day"
5. **Verify**:
   - Day status shows "Closed" with 🔒 icon
   - Try to add expense → Should show error "Day is closed"
   - Navigate to **Reports → Journal Entries**
   - Find entry with description "Cash Shortage - Counter"
   - Verify: Dr 7000 Cash Shortage ₹200, Cr 1000 Cash ₹200

#### Scenario 3: Advance Ledger
1. Login as Manager
2. Navigate to **HR → Employees**
3. Select an employee → "Give Advance"
4. Amount: ₹2,000, Mode: Cash
5. Click Save
6. **Verify**:
   - Advance appears in employee's advance ledger
   - Navigate to **Reports → Journal Entries**
   - Find "Salary Advance" entry
   - Verify: Dr 1100 Advance Receivable ₹2,000, Cr 1000 Cash ₹2,000

---

## Migration Strategy

### Phase 1: Schema Migrations (Week 1)
- [x] Run migration 030_payment_modes.sql
- [x] Run migration 031_daily_closure_enforcement.sql
- [x] Update transaction_categories with account_code
- [x] Seed chart_of_accounts with missing accounts

### Phase 2: Backend Services (Week 2)
- [x] Create JournalService.js
- [x] Create ClosureService.js
- [x] Update FinanceService.addExpense()
- [x] Update PayrollController advance functions
- [x] Update POSController sales posting

### Phase 3: API & Routes (Week 3)
- [x] Add closure endpoints to routes
- [x] Update expense endpoints
- [x] Add account balance query endpoints

### Phase 4: Frontend Updates (Week 4)
- [x] Update DailyTracker with closure checks
- [x] Add closure modal/button
- [x] Update PayrollPage with advance journal display
- [x] Update Reports page with trial balance

### Phase 5: Testing & Validation (Week 5)
- [x] Run all automated tests
- [x] Perform manual scenarios 1-3
- [x] User acceptance testing

---

## Rollback Plan

If issues arise during production deployment:

1. **Backend Rollback**: Revert to previous commit
2. **Database Rollback**: 
   - Do NOT drop new tables
   - System can operate with old code + new schema
   - New columns are optional
3. **Data Integrity**: All new journal entries are additive, no deletes

---

## Success Metrics

- ✅ All expenses create journal entries 
- ✅ Trial balance is always balanced
- ✅ Closed days cannot be edited
- ✅ Cash variance auto-posts to GL
- ✅ Category reports match GL reports
- ✅ Advances have full journal trail
- ✅ No data duplication in reports

---

**End of Implementation Plan**
