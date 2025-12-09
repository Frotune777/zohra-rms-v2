const db = require('../../config/db');

/**
 * Calculate running balance for a vendor
 * Returns array of transactions with running balance
 */
exports.calculateRunningBalance = async (vendorId, startDate = null, endDate = null) => {
    try {
        let query = `
            SELECT 
                vl.id,
                vl.date,
                vl.transaction_type,
                vl.amount,
                vl.details,
                vl.payment_mode,
                vl.reference_number,
                s.opening_balance
            FROM vendor_ledger vl
            JOIN suppliers s ON vl.supplier_id = s.id
            WHERE vl.supplier_id = $1
        `;
        const params = [vendorId];
        let paramCount = 2;

        if (startDate) {
            query += ` AND vl.date >= $${paramCount}`;
            params.push(startDate);
            paramCount++;
        }

        if (endDate) {
            query += ` AND vl.date <= $${paramCount}`;
            params.push(endDate);
            paramCount++;
        }

        query += ' ORDER BY vl.date ASC, vl.created_at ASC';

        const result = await db.query(query, params);

        // Calculate running balance
        let runningBalance = parseFloat(result.rows[0]?.opening_balance || 0);
        const transactions = result.rows.map(txn => {
            const amount = parseFloat(txn.amount);
            runningBalance += amount;

            return {
                id: txn.id,
                date: txn.date,
                transaction_type: txn.transaction_type,
                amount: amount,
                details: txn.details,
                payment_mode: txn.payment_mode,
                reference_number: txn.reference_number,
                running_balance: runningBalance
            };
        });

        return {
            opening_balance: parseFloat(result.rows[0]?.opening_balance || 0),
            transactions,
            closing_balance: runningBalance
        };

    } catch (err) {
        throw new Error(`Running balance calculation failed: ${err.message}`);
    }
};

/**
 * Get outstanding amount for a vendor
 */
exports.getOutstandingAmount = async (vendorId) => {
    try {
        const result = await db.query(`
            SELECT 
                s.opening_balance,
                COALESCE(SUM(CASE 
                    WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.amount
                    WHEN vl.transaction_type = 'Payment' THEN vl.amount
                    ELSE 0 
                END), 0) as total_transactions
            FROM suppliers s
            LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id
            WHERE s.id = $1
            GROUP BY s.id, s.opening_balance
        `, [vendorId]);

        if (result.rows.length === 0) {
            throw new Error('Vendor not found');
        }

        const openingBalance = parseFloat(result.rows[0].opening_balance || 0);
        const totalTransactions = parseFloat(result.rows[0].total_transactions || 0);
        const outstanding = openingBalance + totalTransactions;

        return {
            vendor_id: vendorId,
            opening_balance: openingBalance,
            total_transactions: totalTransactions,
            outstanding_amount: outstanding
        };

    } catch (err) {
        throw new Error(`Outstanding calculation failed: ${err.message}`);
    }
};

/**
 * Get category-wise aggregation
 */
exports.getCategoryAggregation = async (categoryId = null, startDate = null, endDate = null) => {
    try {
        let query = `
            SELECT 
                vc.id as category_id,
                vc.name as category_name,
                COUNT(DISTINCT s.id) as vendor_count,
                COALESCE(SUM(CASE 
                    WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.amount
                    WHEN vl.transaction_type = 'Payment' THEN vl.amount
                    ELSE 0 
                END), 0) as total_transactions,
                COALESCE(SUM(s.opening_balance), 0) as total_opening_balance
            FROM vendor_categories vc
            LEFT JOIN suppliers s ON vc.id = s.category_id
            LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (categoryId) {
            query += ` AND vc.id = $${paramCount}`;
            params.push(categoryId);
            paramCount++;
        }

        if (startDate) {
            query += ` AND (vl.date >= $${paramCount} OR vl.date IS NULL)`;
            params.push(startDate);
            paramCount++;
        }

        if (endDate) {
            query += ` AND (vl.date <= $${paramCount} OR vl.date IS NULL)`;
            params.push(endDate);
            paramCount++;
        }

        query += ' GROUP BY vc.id, vc.name ORDER BY total_transactions DESC';

        const result = await db.query(query, params);

        return result.rows.map(row => ({
            category_id: row.category_id,
            category_name: row.category_name,
            vendor_count: parseInt(row.vendor_count),
            total_opening_balance: parseFloat(row.total_opening_balance),
            total_transactions: parseFloat(row.total_transactions),
            outstanding_balance: parseFloat(row.total_opening_balance) + parseFloat(row.total_transactions)
        }));

    } catch (err) {
        throw new Error(`Category aggregation failed: ${err.message}`);
    }
};

/**
 * Get payment history with filters
 */
exports.getPaymentHistory = async (vendorId = null, startDate = null, endDate = null, paymentMode = null) => {
    try {
        let query = `
            SELECT 
                vp.id,
                vp.vendor_id,
                s.name as vendor_name,
                vp.payment_date,
                vp.amount,
                vp.payment_mode,
                vp.reference_number,
                vp.notes,
                vp.paid_by,
                vp.created_at
            FROM vendor_payments vp
            JOIN suppliers s ON vp.vendor_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (vendorId) {
            query += ` AND vp.vendor_id = $${paramCount}`;
            params.push(vendorId);
            paramCount++;
        }

        if (startDate) {
            query += ` AND vp.payment_date >= $${paramCount}`;
            params.push(startDate);
            paramCount++;
        }

        if (endDate) {
            query += ` AND vp.payment_date <= $${paramCount}`;
            params.push(endDate);
            paramCount++;
        }

        if (paymentMode) {
            query += ` AND vp.payment_mode = $${paramCount}`;
            params.push(paymentMode);
            paramCount++;
        }

        query += ' ORDER BY vp.payment_date DESC, vp.created_at DESC';

        const result = await db.query(query, params);

        // Calculate totals
        const totalAmount = result.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
        const paymentModes = {};

        result.rows.forEach(row => {
            const mode = row.payment_mode;
            if (!paymentModes[mode]) {
                paymentModes[mode] = { count: 0, total: 0 };
            }
            paymentModes[mode].count++;
            paymentModes[mode].total += parseFloat(row.amount);
        });

        return {
            payments: result.rows,
            summary: {
                total_payments: result.rows.length,
                total_amount: totalAmount,
                by_mode: paymentModes
            }
        };

    } catch (err) {
        throw new Error(`Payment history retrieval failed: ${err.message}`);
    }
};

/**
 * Get date-range filtered ledger
 */
exports.getDateRangeReport = async (startDate, endDate, categoryId = null) => {
    try {
        let query = `
            SELECT 
                vl.date,
                vl.transaction_type,
                SUM(CASE WHEN vl.transaction_type IN ('Bill', 'Purchase') THEN vl.amount ELSE 0 END) as total_bills,
                SUM(CASE WHEN vl.transaction_type = 'Payment' THEN ABS(vl.amount) ELSE 0 END) as total_payments,
                COUNT(DISTINCT vl.supplier_id) as vendor_count,
                COUNT(*) as transaction_count
            FROM vendor_ledger vl
            JOIN suppliers s ON vl.supplier_id = s.id
            WHERE vl.date BETWEEN $1 AND $2
        `;
        const params = [startDate, endDate];

        if (categoryId) {
            query += ' AND s.category_id = $3';
            params.push(categoryId);
        }

        query += ' GROUP BY vl.date, vl.transaction_type ORDER BY vl.date DESC';

        const result = await db.query(query, params);

        // Aggregate totals
        const totals = {
            total_bills: 0,
            total_payments: 0,
            net_outstanding: 0,
            transaction_count: 0
        };

        result.rows.forEach(row => {
            totals.total_bills += parseFloat(row.total_bills || 0);
            totals.total_payments += parseFloat(row.total_payments || 0);
            totals.transaction_count += parseInt(row.transaction_count || 0);
        });

        totals.net_outstanding = totals.total_bills - totals.total_payments;

        return {
            date_range: { start: startDate, end: endDate },
            daily_breakdown: result.rows,
            totals
        };

    } catch (err) {
        throw new Error(`Date range report failed: ${err.message}`);
    }
};

/**
 * Get vendor aging report (how long bills are outstanding)
 */
exports.getAgingReport = async () => {
    try {
        const result = await db.query(`
            SELECT 
                s.id as vendor_id,
                s.name as vendor_name,
                vo.outstanding_balance,
                MIN(vl.date) as oldest_bill_date,
                MAX(vl.date) as latest_transaction_date,
                CURRENT_DATE - MIN(vl.date) as days_outstanding
            FROM suppliers s
            JOIN vendor_outstanding vo ON s.id = vo.vendor_id
            LEFT JOIN vendor_ledger vl ON s.id = vl.supplier_id 
                AND vl.transaction_type IN ('Bill', 'Purchase')
            WHERE vo.outstanding_balance > 0
            GROUP BY s.id, s.name, vo.outstanding_balance
            ORDER BY days_outstanding DESC
        `);

        return result.rows.map(row => ({
            vendor_id: row.vendor_id,
            vendor_name: row.vendor_name,
            outstanding_balance: parseFloat(row.outstanding_balance),
            oldest_bill_date: row.oldest_bill_date,
            latest_transaction_date: row.latest_transaction_date,
            days_outstanding: parseInt(row.days_outstanding || 0),
            aging_category: parseInt(row.days_outstanding) > 90 ? '>90 days' :
                parseInt(row.days_outstanding) > 60 ? '60-90 days' :
                    parseInt(row.days_outstanding) > 30 ? '30-60 days' : '0-30 days'
        }));

    } catch (err) {
        throw new Error(`Aging report failed: ${err.message}`);
    }
};

module.exports = exports;
