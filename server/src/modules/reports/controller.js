const db = require('../../config/db');

// Helper to ensure valid dates
const getsatfeDateRange = (startDate, endDate) => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  return [
    startDate || firstDay,
    endDate || lastDay
  ];
};

// ==================== FINANCIAL REPORTS ====================

/**
 * Get Financial Overview
 * Returns revenue, expenses, profit, and trends
 */
async function getFinancialOverview(req, res) {
  try {
    const [startDate, endDate] = getsatfeDateRange(req.query.startDate, req.query.endDate);

    // Revenue and Expenses Summary
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN coa.type = 'Revenue' THEN ll.credit ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN coa.type = 'Expense' THEN ll.debit ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN coa.type = 'Revenue' THEN ll.credit ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN coa.type = 'Expense' THEN ll.debit ELSE 0 END), 0) as net_profit
      FROM ledger_lines ll
      JOIN chart_of_accounts coa ON ll.account_code = coa.code
      JOIN journal_entries je ON ll.journal_entry_id = je.id
      WHERE je.transaction_date >= $1 AND je.transaction_date <= $2
    `;

    const summary = await db.query(summaryQuery, [startDate, endDate]);

    // Revenue Trend (daily)
    const revenueTrendQuery = `
      SELECT 
        DATE(je.transaction_date) as date,
        COALESCE(SUM(ll.credit), 0) as revenue
      FROM ledger_lines ll
      JOIN chart_of_accounts coa ON ll.account_code = coa.code
      JOIN journal_entries je ON ll.journal_entry_id = je.id
      WHERE coa.type = 'Revenue'
        AND je.transaction_date >= $1 
        AND je.transaction_date <= $2
      GROUP BY DATE(je.transaction_date)
      ORDER BY date ASC
    `;

    const revenueTrend = await db.query(revenueTrendQuery, [startDate, endDate]);

    // Expense Trend (daily)
    const expenseTrendQuery = `
      SELECT 
        DATE(je.transaction_date) as date,
        COALESCE(SUM(ll.debit), 0) as expenses
      FROM ledger_lines ll
      JOIN chart_of_accounts coa ON ll.account_code = coa.code
      JOIN journal_entries je ON ll.journal_entry_id = je.id
      WHERE coa.type = 'Expense'
        AND je.transaction_date >= $1 
        AND je.transaction_date <= $2
      GROUP BY DATE(je.transaction_date)
      ORDER BY date ASC
    `;

    const expenseTrend = await db.query(expenseTrendQuery, [startDate, endDate]);

    res.json({
      summary: summary.rows[0],
      revenueTrend: revenueTrend.rows,
      expenseTrend: expenseTrend.rows
    });
  } catch (error) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({ error: 'Failed to fetch financial overview' });
  }
}

/**
 * Get Expense Breakdown by Category
 */
async function getExpenseBreakdown(req, res) {
  try {
    const [startDate, endDate] = getsatfeDateRange(req.query.startDate, req.query.endDate);

    const query = `
      SELECT 
        coa.name as category,
        COALESCE(SUM(ll.debit), 0) as amount,
        COUNT(*) as transaction_count
      FROM ledger_lines ll
      JOIN chart_of_accounts coa ON ll.account_code = coa.code
      JOIN journal_entries je ON ll.journal_entry_id = je.id
      WHERE coa.type = 'Expense'
        AND je.transaction_date >= $1 
        AND je.transaction_date <= $2
      GROUP BY coa.name
      ORDER BY amount DESC
    `;

    const result = await db.query(query, [startDate, endDate]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching expense breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch expense breakdown' });
  }
}

/**
 * Get Revenue Trends with breakdown
 */
async function getRevenueTrends(req, res) {
  try {
    const { groupBy = 'day' } = req.query;
    const [startDate, endDate] = getsatfeDateRange(req.query.startDate, req.query.endDate);

    let dateFormat;
    switch (groupBy) {
      case 'week':
        dateFormat = "DATE_TRUNC('week', je.transaction_date)";
        break;
      case 'month':
        dateFormat = "DATE_TRUNC('month', je.transaction_date)";
        break;
      default:
        dateFormat = "DATE(je.transaction_date)";
    }

    const query = `
      SELECT 
        ${dateFormat} as period,
        COALESCE(SUM(ll.credit), 0) as revenue,
        COUNT(DISTINCT je.id) as transaction_count
      FROM ledger_lines ll
      JOIN chart_of_accounts coa ON ll.account_code = coa.code
      JOIN journal_entries je ON ll.journal_entry_id = je.id
      WHERE coa.type = 'Revenue'
        AND je.transaction_date >= $1 
        AND je.transaction_date <= $2
      GROUP BY ${dateFormat}
      ORDER BY period ASC
    `;

    const result = await db.query(query, [startDate, endDate]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching revenue trends:', error);
    res.status(500).json({ error: 'Failed to fetch revenue trends' });
  }
}

/**
 * Get Balance Sheet
 */
async function getBalanceSheet(req, res) {
  try {
    const { date } = req.query; // As of date
    const asOfDate = date || new Date().toISOString().split('T')[0];

    // Calculate Net Profit (Retained Earnings) up to this date
    // Revenue (Credit) - Expense (Debit)
    const retainedEarningsQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN coa.type = 'Revenue' THEN ll.credit - ll.debit ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.type = 'Expense' THEN ll.debit - ll.credit ELSE 0 END), 0) as net_profit
            FROM ledger_lines ll
            JOIN chart_of_accounts coa ON ll.account_code = coa.code
            JOIN journal_entries je ON ll.journal_entry_id = je.id
            WHERE je.transaction_date <= $1
        `;
    const reRes = await db.query(retainedEarningsQuery, [asOfDate]);
    const netProfit = parseFloat(reRes.rows[0].net_profit || 0);

    // Get Account Balances for Assets, Liabilities, Equity
    const balancesQuery = `
            SELECT 
                coa.code,
                coa.name,
                coa.type,
                COALESCE(SUM(ll.debit), 0) as total_debit,
                COALESCE(SUM(ll.credit), 0) as total_credit
            FROM chart_of_accounts coa
            LEFT JOIN ledger_lines ll ON coa.code = ll.account_code
            LEFT JOIN journal_entries je ON ll.journal_entry_id = je.id AND je.transaction_date <= $1
            WHERE coa.type IN ('Asset', 'Liability', 'Equity')
            GROUP BY coa.code, coa.name, coa.type
        `;
    const balancesRes = await db.query(balancesQuery, [asOfDate]);

    const assets = [];
    const liabilities = [];
    const equity = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    balancesRes.rows.forEach(acc => {
      const debit = parseFloat(acc.total_debit);
      const credit = parseFloat(acc.total_credit);
      let balance = 0;

      if (acc.type === 'Asset') {
        balance = debit - credit;
        if (Math.abs(balance) > 0.01) {
          assets.push({ ...acc, balance });
          totalAssets += balance;
        }
      } else if (acc.type === 'Liability') {
        balance = credit - debit;
        if (Math.abs(balance) > 0.01) {
          liabilities.push({ ...acc, balance });
          totalLiabilities += balance;
        }
      } else if (acc.type === 'Equity') {
        balance = credit - debit;
        if (Math.abs(balance) > 0.01) {
          equity.push({ ...acc, balance });
          totalEquity += balance;
        }
      }
    });

    // Add Net Profit to Equity (Retained Earnings)
    if (Math.abs(netProfit) > 0.01) {
      equity.push({ code: '9999', name: 'Retained Earnings (Net Profit)', type: 'Equity', balance: netProfit });
      totalEquity += netProfit;
    }

    res.json({
      assets,
      liabilities,
      equity,
      summary: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity
      }
    });

  } catch (error) {
    console.error('Error fetching balance sheet:', error);
    res.status(500).json({ error: 'Failed to fetch balance sheet' });
  }
}

// ==================== HR & PAYROLL REPORTS ====================

/**
 * Get Payroll Summary
 */
/**
 * Get Daily Stats (Cash vs Bank)
 */
async function getDailyStats(req, res) {
  try {
    const { date } = req.query;
    const queryDate = date || new Date().toISOString().split('T')[0];

    // Sales by Payment Method
    const salesQuery = `
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payment_transactions
      WHERE DATE(transaction_date) = $1
      GROUP BY payment_method
    `;
    const salesRes = await db.query(salesQuery, [queryDate]);

    // Total Revenue
    const totalRevenue = salesRes.rows.reduce((sum, row) => sum + parseFloat(row.total_amount), 0);

    // Cash in Hand (Cash Sales - Cash Expenses) -- Simplified
    // Real logic would be: Opening Balance + Cash Sales - Cash Expenses (Petty Cash)
    // Here we just return Cash Sales + Cash Payments Received
    const cashSales = salesRes.rows.find(r => r.payment_method === 'Cash')?.total_amount || 0;

    res.json({
      date: queryDate,
      totalRevenue,
      salesBreakdown: salesRes.rows,
      cashCollected: cashSales
    });
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
}

/**
 * Get Payroll Summary
 */
async function getPayrollSummary(req, res) {
  try {
    const { startDate, endDate, month, year } = req.query;

    let query, params;

    if (month && year) {
      // Monthly summary
      query = `
        SELECT 
          COUNT(DISTINCT sh.employee_id) as employee_count,
          COALESCE(SUM(sh.calculated_salary), 0) as total_gross_salary,
          COALESCE(SUM(sh.advance_deduction), 0) as total_advance_deductions,
          COALESCE(SUM(sh.net_pay), 0) as total_net_pay,
          COALESCE(AVG(sh.days_worked), 0) as avg_days_worked
        FROM salary_history sh
        WHERE sh.month = $1 AND sh.year = $2
      `;
      params = [month, year];
    } else {
      // Date range summary
      const [start, end] = getsatfeDateRange(startDate, endDate);
      query = `
        SELECT 
          COUNT(DISTINCT sh.employee_id) as employee_count,
          COALESCE(SUM(sh.calculated_salary), 0) as total_gross_salary,
          COALESCE(SUM(sh.advance_deduction), 0) as total_advance_deductions,
          COALESCE(SUM(sh.net_pay), 0) as total_net_pay,
          COALESCE(AVG(sh.days_worked), 0) as avg_days_worked
        FROM salary_history sh
        WHERE sh.processed_at >= $1 AND sh.processed_at <= $2
      `;
      params = [start, end];
    }

    const summary = await db.query(query, params);

    // Get Component-wise Breakdown (New P1 Feature)
    let compQuery = `
        SELECT 
            sc.component_name, 
            sc.type, 
            SUM(sc.amount) as total_amount
        FROM salary_history_components sc
        JOIN salary_history sh ON sc.salary_history_id = sh.id
        WHERE 1=1
    `;
    let compParams = [];
    if (month && year) {
      compQuery += ` AND sh.month = $1 AND sh.year = $2`;
      compParams = [month, year];
    } else {
      compQuery += ` AND sh.processed_at >= $1 AND sh.processed_at <= $2`;
      compParams = [startDate, endDate];
    }
    compQuery += ` GROUP BY sc.component_name, sc.type ORDER BY sc.type, total_amount DESC`;

    const breakdown = await db.query(compQuery, compParams);

    // Get monthly trend
    const trendQuery = `
      SELECT 
        month,
        year,
        COALESCE(SUM(net_pay), 0) as total_payout,
        COUNT(DISTINCT employee_id) as employee_count
      FROM salary_history
      GROUP BY year, month
      ORDER BY year DESC, month DESC
      LIMIT 12
    `;

    const trend = await db.query(trendQuery);

    res.json({
      summary: summary.rows[0],
      componentBreakdown: breakdown.rows,
      monthlyTrend: trend.rows
    });
  } catch (error) {
    console.error('Error fetching payroll summary:', error);
    res.status(500).json({ error: 'Failed to fetch payroll summary' });
  }
}

/**
 * Get Advance Tracking Report
 */
async function getAdvanceTracking(req, res) {
  try {
    const [startDate, endDate] = getsatfeDateRange(req.query.startDate, req.query.endDate);

    // Get all advances with employee details
    const advancesQuery = `
      SELECT 
        e.id as employee_id,
        e.full_name,
        e.position,
        COALESCE(SUM(CASE WHEN LOWER(al.transaction_type) = 'advance' THEN al.amount ELSE 0 END), 0) as total_advances,
        COALESCE(SUM(CASE WHEN LOWER(al.transaction_type) IN ('repayment', 'recovery') THEN al.amount ELSE 0 END), 0) as total_recovered,
        COALESCE(SUM(CASE WHEN LOWER(al.transaction_type) = 'advance' THEN al.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN LOWER(al.transaction_type) IN ('repayment', 'recovery') THEN al.amount ELSE 0 END), 0) as outstanding_balance
      FROM employees e
      LEFT JOIN advance_ledger al ON e.id = al.employee_id
        AND al.transaction_date >= $1 
        AND al.transaction_date <= $2
      WHERE e.status = 'active'
      GROUP BY e.id, e.full_name, e.position
      HAVING COALESCE(SUM(CASE WHEN LOWER(al.transaction_type) = 'advance' THEN al.amount ELSE 0 END), 0) > 0
      ORDER BY outstanding_balance DESC
    `;

    const advances = await db.query(advancesQuery, [startDate, endDate]);

    // Get summary
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'advance' THEN amount ELSE 0 END), 0) as total_advances_given,
        COALESCE(SUM(CASE WHEN transaction_type = 'recovery' THEN amount ELSE 0 END), 0) as total_recovered,
        COUNT(DISTINCT employee_id) as employees_with_advances
      FROM advance_ledger
      WHERE transaction_date >= $1 AND transaction_date <= $2
    `;

    const summary = await db.query(summaryQuery, [startDate, endDate]);

    res.json({
      summary: summary.rows[0],
      advances: advances.rows
    });
  } catch (error) {
    console.error('Error fetching advance tracking:', error);
    res.status(500).json({ error: 'Failed to fetch advance tracking' });
  }
}

/**
 * Get Attendance Analytics
 */
async function getAttendanceAnalytics(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Overall attendance stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN status = 'Present' THEN 1 END) as present_count,
        COUNT(CASE WHEN status = 'Absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN status = 'Half-Day' THEN 1 END) as half_day_count,
        ROUND(COUNT(CASE WHEN status = 'Present' THEN 1 END)::NUMERIC / 
              NULLIF(COUNT(*)::NUMERIC, 0) * 100, 2) as attendance_rate
      FROM attendance
      WHERE date >= $1 AND date <= $2
    `;

    const stats = await db.query(statsQuery, [startDate, endDate]);

    // Employee-wise attendance
    const employeeQuery = `
      SELECT 
        e.id,
        e.full_name,
        e.position,
        COUNT(a.id) as total_days,
        COUNT(CASE WHEN a.status = 'Present' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'Half-Day' THEN 1 END) as half_days,
        ROUND(COUNT(CASE WHEN a.status = 'Present' THEN 1 END)::NUMERIC / 
              NULLIF(COUNT(a.id)::NUMERIC, 0) * 100, 2) as attendance_percentage
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id
        AND a.date >= $1 AND a.date <= $2
      WHERE e.status = 'active'
      GROUP BY e.id, e.full_name, e.position
      ORDER BY attendance_percentage DESC
    `;

    const employeeStats = await db.query(employeeQuery, [startDate, endDate]);

    // Daily attendance trend
    const trendQuery = `
      SELECT 
        date,
        COUNT(CASE WHEN status = 'Present' THEN 1 END) as present,
        COUNT(CASE WHEN status = 'Absent' THEN 1 END) as absent,
        COUNT(CASE WHEN status = 'Half-Day' THEN 1 END) as half_day
      FROM attendance
      WHERE date >= $1 AND date <= $2
      GROUP BY date
      ORDER BY date ASC
    `;

    const trend = await db.query(trendQuery, [startDate, endDate]);

    res.json({
      stats: stats.rows[0],
      employeeStats: employeeStats.rows,
      trend: trend.rows
    });
  } catch (error) {
    console.error('Error fetching attendance analytics:', error);
    res.status(500).json({ error: 'Failed to fetch attendance analytics' });
  }
}

// ==================== OPERATIONS REPORTS ====================

/**
 * Get Chicken Analytics
 */
async function getChickenAnalytics(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Daily rates trend
    const ratesQuery = `
      SELECT 
        date,
        tandoor_rate,
        boiler_rate,
        egg_rate
      FROM daily_rates
      WHERE date >= $1 AND date <= $2
      ORDER BY date ASC
    `;

    const rates = await db.query(ratesQuery, [startDate, endDate]);

    // Bill summary
    const billSummaryQuery = `
      SELECT 
        COUNT(*) as total_bills,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_bills,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_bills,
        COUNT(CASE WHEN status = 'Rejected' THEN 1 END) as rejected_bills,
        COALESCE(SUM(qty * vendor_rate), 0) as total_amount,
        COALESCE(SUM(variance), 0) as total_variance
      FROM bill_entries
      WHERE date >= $1 AND date <= $2
    `;

    const billSummary = await db.query(billSummaryQuery, [startDate, endDate]);

    // Item-wise purchase summary
    const itemSummaryQuery = `
      SELECT 
        item_name,
        COALESCE(SUM(qty), 0) as total_qty,
        COALESCE(AVG(vendor_rate), 0) as avg_rate,
        COALESCE(SUM(qty * vendor_rate), 0) as total_amount,
        COUNT(*) as bill_count
      FROM bill_entries
      WHERE date >= $1 AND date <= $2
      GROUP BY item_name
      ORDER BY total_amount DESC
    `;

    const itemSummary = await db.query(itemSummaryQuery, [startDate, endDate]);

    res.json({
      rates: rates.rows,
      billSummary: billSummary.rows[0],
      itemSummary: itemSummary.rows
    });
  } catch (error) {
    console.error('Error fetching chicken analytics:', error);
    res.status(500).json({ error: 'Failed to fetch chicken analytics' });
  }
}

/**
 * Get Vendor Performance
 */
async function getVendorPerformance(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Vendor-wise performance
    const vendorQuery = `
      SELECT 
        s.id,
        s.name,
        s.vendor_type,
        COUNT(be.id) as total_bills,
        COALESCE(SUM(be.qty * be.vendor_rate), 0) as total_amount,
        COALESCE(AVG(be.variance), 0) as avg_variance,
        COALESCE(SUM(be.variance), 0) as total_variance,
        COUNT(CASE WHEN be.status = 'Approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN be.status = 'Pending' THEN 1 END) as pending_count
      FROM suppliers s
      LEFT JOIN bill_entries be ON s.id = be.supplier_id
        AND be.date >= $1 AND be.date <= $2
      GROUP BY s.id, s.name, s.vendor_type
      HAVING COUNT(be.id) > 0
      ORDER BY total_amount DESC
    `;

    const vendors = await db.query(vendorQuery, [startDate, endDate]);

    // Vendor ledger summary
    const ledgerQuery = `
      SELECT 
        s.id,
        s.name,
        COALESCE(SUM(CASE WHEN vl.transaction_type = 'Bill' THEN vl.amount ELSE 0 END), 0) as total_bills,
        COALESCE(SUM(CASE WHEN vl.transaction_type = 'Payment' THEN vl.amount ELSE 0 END), 0) as total_payments,
        COALESCE(SUM(CASE WHEN vl.transaction_type = 'Bill' THEN vl.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN vl.transaction_type = 'Payment' THEN vl.amount ELSE 0 END), 0) as outstanding_balance
      FROM suppliers s
      LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id
        AND vl.date >= $1 AND vl.date <= $2
      GROUP BY s.id, s.name
      HAVING COALESCE(SUM(CASE WHEN vl.transaction_type = 'Bill' THEN vl.amount ELSE 0 END), 0) > 0
      ORDER BY outstanding_balance DESC
    `;

    const ledger = await db.query(ledgerQuery, [startDate, endDate]);

    res.json({
      vendorPerformance: vendors.rows,
      vendorLedger: ledger.rows
    });
  } catch (error) {
    console.error('Error fetching vendor performance:', error);
    res.status(500).json({ error: 'Failed to fetch vendor performance' });
  }
}

// ==================== INVENTORY REPORTS ====================

/**
 * Get Stock Status
 */
async function getStockStatus(req, res) {
  try {
    // Current stock levels
    const stockQuery = `
      SELECT 
        id,
        name,
        stock_qty,
        unit_cost,
        unit,
        (stock_qty * unit_cost) as stock_value,
        CASE 
          WHEN stock_qty <= 10 THEN 'low'
          WHEN stock_qty <= 30 THEN 'medium'
          ELSE 'high'
        END as stock_level
      FROM inventory_items
      ORDER BY stock_value DESC
    `;

    const stock = await db.query(stockQuery);

    // Summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_items,
        COALESCE(SUM(stock_qty * unit_cost), 0) as total_value,
        COUNT(CASE WHEN stock_qty <= 10 THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN stock_qty = 0 THEN 1 END) as out_of_stock_count
      FROM inventory_items
    `;

    const summary = await db.query(summaryQuery);

    res.json({
      summary: summary.rows[0],
      items: stock.rows
    });
  } catch (error) {
    console.error('Error fetching stock status:', error);
    res.status(500).json({ error: 'Failed to fetch stock status' });
  }
}

/**
 * Get Wastage Report
 */
async function getWastageReport(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Wastage summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_incidents,
        COALESCE(SUM(cost), 0) as total_cost,
        COALESCE(SUM(qty), 0) as total_qty
      FROM wastage_logs
      WHERE created_at >= $1 AND created_at <= $2
    `;

    const summary = await db.query(summaryQuery, [startDate, endDate]);

    // Item-wise wastage
    const itemWastageQuery = `
      SELECT 
        ii.name as item_name,
        ii.unit,
        COALESCE(SUM(wl.qty), 0) as total_qty,
        COALESCE(SUM(wl.cost), 0) as total_cost,
        COUNT(*) as incident_count,
        wl.reason
      FROM wastage_logs wl
      JOIN inventory_items ii ON wl.inventory_item_id = ii.id
      WHERE wl.created_at >= $1 AND wl.created_at <= $2
      GROUP BY ii.name, ii.unit, wl.reason
      ORDER BY total_cost DESC
    `;

    const itemWastage = await db.query(itemWastageQuery, [startDate, endDate]);

    // Wastage trend
    const trendQuery = `
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(cost), 0) as daily_cost,
        COUNT(*) as incident_count
      FROM wastage_logs
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const trend = await db.query(trendQuery, [startDate, endDate]);

    res.json({
      summary: summary.rows[0],
      itemWastage: itemWastage.rows,
      trend: trend.rows
    });
  } catch (error) {
    console.error('Error fetching wastage report:', error);
    res.status(500).json({ error: 'Failed to fetch wastage report' });
  }
}

// ==================== DASHBOARD KPIs ====================

/**
 * Get Dashboard KPIs
 */
async function getDashboardKPIs(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Financial KPIs
    const financialQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN coa.type = 'Revenue' THEN ll.credit ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN coa.type = 'Expense' THEN ll.debit ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN coa.type = 'Revenue' THEN ll.credit ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN coa.type = 'Expense' THEN ll.debit ELSE 0 END), 0) as net_profit
      FROM ledger_lines ll
      JOIN chart_of_accounts coa ON ll.account_code = coa.code
      JOIN journal_entries je ON ll.journal_entry_id = je.id
      WHERE je.transaction_date >= $1 AND je.transaction_date <= $2
    `;

    const financial = await db.query(financialQuery, [startDate, endDate]);

    // HR KPIs
    const hrQuery = `
      SELECT 
        COUNT(DISTINCT id) as total_employees,
        COALESCE(SUM(base_salary), 0) as total_salary_base
      FROM employees
      WHERE status = 'active'
    `;

    const hr = await db.query(hrQuery);

    // Outstanding advances
    const advancesQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'advance' THEN amount ELSE -amount END), 0) as outstanding_advances
      FROM advance_ledger
    `;

    const advances = await db.query(advancesQuery);

    // Inventory KPIs
    const inventoryQuery = `
      SELECT 
        COUNT(*) as total_items,
        COALESCE(SUM(stock_qty * unit_cost), 0) as inventory_value,
        COUNT(CASE WHEN stock_qty <= 10 THEN 1 END) as low_stock_items
      FROM inventory_items
    `;

    const inventory = await db.query(inventoryQuery);

    // Operations KPIs
    const operationsQuery = `
      SELECT 
        COUNT(*) as total_bills,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_bills,
        COALESCE(SUM(variance), 0) as total_variance
      FROM bill_entries
      WHERE date >= $1 AND date <= $2
    `;

    const operations = await db.query(operationsQuery, [startDate, endDate]);

    res.json({
      financial: financial.rows[0],
      hr: hr.rows[0],
      advances: advances.rows[0],
      inventory: inventory.rows[0],
      operations: operations.rows[0]
    });
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard KPIs' });
  }
}

module.exports = {
  // Financial
  getFinancialOverview,
  getDailyStats,
  getExpenseBreakdown,
  getRevenueTrends,
  getBalanceSheet,

  // HR & Payroll
  getPayrollSummary,
  getAdvanceTracking,
  getAttendanceAnalytics,

  // Operations
  getChickenAnalytics,
  getVendorPerformance,

  // Inventory
  getStockStatus,
  getWastageReport,

  // Dashboard
  getDashboardKPIs
};
