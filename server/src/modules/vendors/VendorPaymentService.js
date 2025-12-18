const db = require('../../config/db');
const JournalService = require('../finance/JournalService');
const JournalEntry = require('../finance/entities/JournalEntry');
const PaymentModeService = require('../finance/PaymentModeService');

class VendorPaymentService {
    /**
     * Process Vendor Payment
     */
    async processPayment({ vendorId, amount, paymentMode, reference, notes, paidBy, userId }, client) {
        // 1. Validate vendor exists
        const vendorRes = await client.query('SELECT * FROM suppliers WHERE id = $1', [vendorId]);
        if (vendorRes.rows.length === 0) throw new Error('Vendor not found');
        const vendor = vendorRes.rows[0];

        // 2. Get outstanding balance
        const balanceRes = await client.query('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1', [vendorId]);
        const outstanding = parseFloat(balanceRes.rows[0]?.outstanding_balance || 0);

        if (parseFloat(amount) > outstanding) {
            throw new Error(`Payment amount (₹${amount}) exceeds outstanding balance (₹${outstanding.toFixed(2)})`);
        }

        // 3. Insert payment record
        const paymentRes = await client.query(`
            INSERT INTO vendor_payments 
            (vendor_id, amount, payment_mode, reference_number, notes, paid_by, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `, [vendorId, parseFloat(amount), paymentMode, reference, notes, paidBy, userId]);
        const payment = paymentRes.rows[0];

        // 4. Update vendor_ledger
        await client.query(`
            INSERT INTO vendor_ledger 
            (supplier_id, date, transaction_type, amount, details, payment_mode, reference_number, payment_id)
            VALUES ($1, CURRENT_DATE, 'Payment', $2, $3, $4, $5, $6)
        `, [vendorId, parseFloat(amount), notes, paymentMode, reference, payment.id]);

        // 5. Financial Journaling (Domain Driven)
        const creditAccount = await PaymentModeService.getAccountCode(paymentMode);

        const journal = new JournalEntry({
            date: new Date(),
            description: `Vendor Payment - ${vendor.name}`,
            reference_id: payment.id,
            reference_type: 'VendorPayment',
            lines: [
                { account_code: 2000, debit: parseFloat(amount), credit: 0 }, // Dr: Vendor Payable (2000)
                { account_code: creditAccount, debit: 0, credit: parseFloat(amount) } // Cr: Cash/Bank
            ]
        });

        const je = await JournalService.createJournalEntry(journal, client);

        // Update payment with JE ID
        await client.query('UPDATE vendor_payments SET journal_entry_id = $1 WHERE id = $2', [je.id, payment.id]);

        // 6. Get new balance
        const newBalanceRes = await client.query('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1', [vendorId]);

        return {
            payment,
            newBalance: parseFloat(newBalanceRes.rows[0]?.outstanding_balance || 0)
        };
    }

    /**
     * Get Payments
     */
    async getPayments({ vendorId, startDate, endDate, paymentMode }) {
        let query = `
            SELECT vp.*, s.name as vendor_name, s.vendor_type
            FROM vendor_payments vp
            JOIN suppliers s ON vp.vendor_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (vendorId) {
            query += ` AND vp.vendor_id = $${paramCount++}`;
            params.push(vendorId);
        }
        if (startDate) {
            query += ` AND vp.payment_date >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND vp.payment_date <= $${paramCount++}`;
            params.push(endDate);
        }
        if (paymentMode) {
            query += ` AND vp.payment_mode = $${paramCount++}`;
            params.push(paymentMode);
        }

        query += ' ORDER BY vp.payment_date DESC, vp.created_at DESC';
        const result = await db.query(query, params);
        return result.rows;
    }

    /**
     * Get Vendor Details (Composite)
     */
    async getVendorDetails(id) {
        const vendorRes = await db.query('SELECT * FROM vendor_outstanding WHERE vendor_id = $1', [id]);
        if (vendorRes.rows.length === 0) throw new Error('Vendor not found');
        const vendor = vendorRes.rows[0];

        // Aging
        const agingRes = await db.query(`
            SELECT 
                SUM(CASE WHEN CURRENT_DATE - date <= 30 THEN amount ELSE 0 END) as days_0_30,
                SUM(CASE WHEN CURRENT_DATE - date > 30 AND CURRENT_DATE - date <= 60 THEN amount ELSE 0 END) as days_30_60,
                SUM(CASE WHEN CURRENT_DATE - date > 60 AND CURRENT_DATE - date <= 90 THEN amount ELSE 0 END) as days_60_90,
                SUM(CASE WHEN CURRENT_DATE - date > 90 THEN amount ELSE 0 END) as days_over_90
            FROM vendor_ledger
            WHERE supplier_id = $1 AND transaction_type = 'Bill' AND amount > 0
        `, [id]);

        vendor.aging = {
            '0_30_days': parseFloat(agingRes.rows[0]?.days_0_30 || 0),
            '30_60_days': parseFloat(agingRes.rows[0]?.days_30_60 || 0),
            '60_90_days': parseFloat(agingRes.rows[0]?.days_60_90 || 0),
            'over_90_days': parseFloat(agingRes.rows[0]?.days_over_90 || 0)
        };

        return vendor;
    }

    async getCategories() {
        const result = await db.query('SELECT * FROM vendor_categories ORDER BY name');
        return result.rows;
    }

    async getAllSuppliers() {
        const result = await db.query('SELECT id, name FROM suppliers ORDER BY name');
        return result.rows;
    }
}

module.exports = new VendorPaymentService();
