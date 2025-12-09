const db = require('../../config/db');

/**
 * Process Vendor Payment
 */
exports.processPayment = async (req, res) => {
    const { vendorId, amount, paymentMode, reference, notes, paidBy } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Validate vendor exists
        const vendorRes = await client.query('SELECT * FROM suppliers WHERE id = $1', [vendorId]);
        if (vendorRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Vendor not found' });
        }
        const vendor = vendorRes.rows[0];

        // 2. Get outstanding balance
        const balanceRes = await client.query(`
            SELECT outstanding_balance 
            FROM vendor_outstanding 
            WHERE vendor_id = $1
        `, [vendorId]);

        const outstanding = parseFloat(balanceRes.rows[0]?.outstanding_balance || 0);

        // 3. Validate amount
        if (!amount || parseFloat(amount) <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        if (parseFloat(amount) > outstanding) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Payment amount (₹${amount}) exceeds outstanding balance (₹${outstanding.toFixed(2)})`
            });
        }

        // 4. Validate required fields
        if (!paymentMode) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Payment mode is required' });
        }

        if (!notes || notes.trim().length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Notes are required' });
        }

        if (!paidBy || paidBy.trim().length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Paid by is required' });
        }

        // 5. Insert payment record
        const paymentRes = await client.query(`
            INSERT INTO vendor_payments 
            (vendor_id, amount, payment_mode, reference_number, notes, paid_by, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `, [vendorId, parseFloat(amount), paymentMode, reference, notes, paidBy, req.user?.id]);

        const payment = paymentRes.rows[0];

        // 6. Update vendor_ledger
        await client.query(`
            INSERT INTO vendor_ledger 
            (supplier_id, date, transaction_type, amount, details, payment_mode, reference_number, payment_id)
            VALUES ($1, CURRENT_DATE, 'Payment', $2, $3, $4, $5, $6)
        `, [vendorId, parseFloat(amount), notes, paymentMode, reference, payment.id]);

        // 7. Create journal entry
        const jeRes = await client.query(`
            INSERT INTO journal_entries (transaction_date, description)
            VALUES (CURRENT_DATE, $1) RETURNING id
        `, [`Vendor Payment - ${vendor.name}`]);

        const jeId = jeRes.rows[0].id;

        // Update payment with journal entry ID
        await client.query('UPDATE vendor_payments SET journal_entry_id = $1 WHERE id = $2', [jeId, payment.id]);

        // 8. Debit: Vendor Payable (2000)
        await client.query(`
            INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
            VALUES ($1, 2000, $2, 0)
        `, [jeId, parseFloat(amount)]);

        // 9. Credit: Cash/Bank/UPI based on payment mode
        const creditAccount = paymentMode === 'Cash' ? 1000 :
            paymentMode === 'UPI' ? 1020 : 1010;

        await client.query(`
            INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
            VALUES ($1, $2, 0, $3)
        `, [jeId, creditAccount, parseFloat(amount)]);

        await client.query('COMMIT');

        // Get updated balance
        const newBalanceRes = await client.query(`
            SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1
        `, [vendorId]);

        res.json({
            success: true,
            payment: payment,
            newBalance: parseFloat(newBalanceRes.rows[0]?.outstanding_balance || 0)
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Payment processing error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

/**
 * Get Vendor Payments (with filters)
 */
exports.getPayments = async (req, res) => {
    try {
        const { vendorId, startDate, endDate, paymentMode } = req.query;

        let query = `
            SELECT vp.*, s.name as vendor_name, s.vendor_type
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
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Vendor Outstanding Balance
 */
exports.getOutstanding = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT * FROM vendor_outstanding WHERE vendor_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error fetching outstanding:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Vendor Ledger
 */
exports.getVendorLedger = async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        let query = `
            SELECT vl.*, s.name as vendor_name, vc.name as category_name
            FROM vendor_ledger vl
            JOIN suppliers s ON vl.supplier_id = s.id
            LEFT JOIN vendor_categories vc ON vl.category_id = vc.id
            WHERE vl.supplier_id = $1
        `;
        const params = [id];
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

        query += ' ORDER BY vl.date DESC, vl.created_at DESC';

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching ledger:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get All Vendors with Outstanding Balances
 */
exports.getVendorsWithOutstanding = async (req, res) => {
    try {
        const { categoryId } = req.query;

        let query = 'SELECT * FROM vendor_outstanding WHERE 1=1';
        const params = [];

        if (categoryId) {
            query += ' AND category_id = $1';
            params.push(categoryId);
        }

        query += ' ORDER BY outstanding_balance DESC';

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching vendors:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Comprehensive Vendor Details
 * Returns all relevant information for payment decision making
 */
exports.getVendorDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get basic vendor info and outstanding balance
        const vendorRes = await db.query(`
            SELECT 
                vo.vendor_id,
                vo.vendor_name,
                vo.vendor_type,
                vo.category_name,
                vo.outstanding_balance,
                vo.total_bills,
                vo.total_payments
            FROM vendor_outstanding vo
            WHERE vo.vendor_id = $1
        `, [id]);

        if (vendorRes.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        const vendor = vendorRes.rows[0];

        // 2. Get total bill amount
        const billAmountRes = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total_bill_amount
            FROM vendor_ledger
            WHERE supplier_id = $1 AND transaction_type = 'Bill'
        `, [id]);
        vendor.total_bill_amount = parseFloat(billAmountRes.rows[0].total_bill_amount);

        // 3. Get total payment amount
        const paymentAmountRes = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total_payment_amount
            FROM vendor_payments
            WHERE vendor_id = $1
        `, [id]);
        vendor.total_payment_amount = parseFloat(paymentAmountRes.rows[0].total_payment_amount);

        // 4. Get last payment details
        const lastPaymentRes = await db.query(`
            SELECT 
                payment_date as date,
                amount,
                payment_mode,
                paid_by,
                notes
            FROM vendor_payments
            WHERE vendor_id = $1
            ORDER BY payment_date DESC, created_at DESC
            LIMIT 1
        `, [id]);

        vendor.last_payment = lastPaymentRes.rows.length > 0 ? lastPaymentRes.rows[0] : null;

        // 5. Get recent payments (last 5)
        const recentPaymentsRes = await db.query(`
            SELECT 
                payment_date as date,
                amount,
                payment_mode,
                notes
            FROM vendor_payments
            WHERE vendor_id = $1
            ORDER BY payment_date DESC, created_at DESC
            LIMIT 5
        `, [id]);

        vendor.recent_payments = recentPaymentsRes.rows;

        // 6. Get aging information (outstanding bills by age)
        const agingRes = await db.query(`
            SELECT 
                SUM(CASE 
                    WHEN CURRENT_DATE - date <= 30 THEN amount 
                    ELSE 0 
                END) as days_0_30,
                SUM(CASE 
                    WHEN CURRENT_DATE - date > 30 AND CURRENT_DATE - date <= 60 THEN amount 
                    ELSE 0 
                END) as days_30_60,
                SUM(CASE 
                    WHEN CURRENT_DATE - date > 60 AND CURRENT_DATE - date <= 90 THEN amount 
                    ELSE 0 
                END) as days_60_90,
                SUM(CASE 
                    WHEN CURRENT_DATE - date > 90 THEN amount 
                    ELSE 0 
                END) as days_over_90
            FROM vendor_ledger
            WHERE supplier_id = $1 
            AND transaction_type = 'Bill'
            AND amount > 0
        `, [id]);

        vendor.aging = {
            '0_30_days': parseFloat(agingRes.rows[0]?.days_0_30 || 0),
            '30_60_days': parseFloat(agingRes.rows[0]?.days_30_60 || 0),
            '60_90_days': parseFloat(agingRes.rows[0]?.days_60_90 || 0),
            'over_90_days': parseFloat(agingRes.rows[0]?.days_over_90 || 0)
        };

        res.json(vendor);

    } catch (err) {
        console.error('Error fetching vendor details:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Vendor Categories
 */
exports.getCategories = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM vendor_categories ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ error: err.message });
    }

};

module.exports = exports;
