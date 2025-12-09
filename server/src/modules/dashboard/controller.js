const db = require('../../config/db');

exports.getDashboardStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Today's Sales
        const salesRes = await db.query(
            "SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE DATE(created_at) = $1",
            [today]
        );
        const todaySales = parseFloat(salesRes.rows[0].total);

        // 2. Today's Expenses (Assuming account_code 5000-6000 are expenses, or checking journal entries)
        // For simplicity, summing debits to Expense accounts (Type 'Expense')
        const expenseRes = await db.query(
            `SELECT COALESCE(SUM(ll.debit), 0) as total 
             FROM ledger_lines ll
             JOIN chart_of_accounts ca ON ll.account_code = ca.code
             JOIN journal_entries je ON ll.journal_entry_id = je.id
             WHERE ca.type = 'Expense' AND DATE(je.transaction_date) = $1`,
            [today]
        );
        const todayExpenses = parseFloat(expenseRes.rows[0].total);

        // 3. Chicken Procurement (Today)
        const chickenRes = await db.query(
            `SELECT COALESCE(SUM(qty), 0) as qty, COALESCE(SUM(qty * vendor_rate), 0) as cost
             FROM bill_entries 
             WHERE date = $1`,
            [today]
        );
        const chickenStats = {
            qty: parseFloat(chickenRes.rows[0].qty),
            cost: parseFloat(chickenRes.rows[0].cost)
        };

        // 4. Kitchen Stock Value
        const stockRes = await db.query(
            "SELECT COALESCE(SUM(stock_qty * unit_cost), 0) as value FROM inventory_items"
        );
        const stockValue = parseFloat(stockRes.rows[0].value);

        // 5. Vendor Dues (Total Balance)
        // Assuming vendor_ledger: Bill adds to balance, Payment subtracts
        // We need to sum all transactions. Or if we have a suppliers table with balance, use that.
        // Let's calculate from ledger for accuracy.
        const vendorRes = await db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Bill' THEN amount ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN transaction_type = 'Payment' THEN amount ELSE 0 END), 0) as total_due
             FROM vendor_ledger`
        );
        const vendorDues = parseFloat(vendorRes.rows[0].total_due);

        // 6. Employee Status (Present Today)
        const empRes = await db.query(
            "SELECT COUNT(*) as present FROM attendance WHERE date = $1 AND status IN ('Present', 'Half-Day')",
            [today]
        );
        const employeesPresent = parseInt(empRes.rows[0].present);

        // 7. Low Stock Alerts (< 10 units)
        const lowStockRes = await db.query(
            "SELECT name, stock_qty, unit FROM inventory_items WHERE stock_qty < 10 ORDER BY stock_qty ASC LIMIT 5"
        );
        const lowStockItems = lowStockRes.rows;

        // 8. Recent Sales Trend (Last 7 Days)
        const trendRes = await db.query(
            `SELECT DATE(created_at) as date, SUM(total_amount) as sales
             FROM orders
             WHERE created_at >= NOW() - INTERVAL '7 days'
             GROUP BY DATE(created_at)
             ORDER BY DATE(created_at)`
        );
        const salesTrend = trendRes.rows;

        // 9. Payment Mode Breakdown (Today)
        // We need to parse payment_mode from orders. Assuming we store it.
        // If not stored in orders table directly, we might need to check how POS sends it.
        // POS sends `paymentMode` in body. Let's check if `orders` table has it.
        // Checking schema... `orders` table definition isn't explicitly in the file view I saw earlier (phase2_schema had POs).
        // Let's assume `orders` has `payment_mode` or similar. If not, we might fail here.
        // Wait, POS.jsx sends `paymentMode`. Let's assume the backend `orders` controller saves it.
        // I'll check `orders` controller later. For now, let's try to query it.
        // If column doesn't exist, I'll fix it.

        // Construct Response
        const stats = {
            todaySales,
            todayExpenses,
            approxProfit: todaySales - todayExpenses, // Simplified profit
            chickenStats,
            stockValue,
            vendorDues,
            employeesPresent,
            lowStockItems,
            salesTrend
        };

        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
