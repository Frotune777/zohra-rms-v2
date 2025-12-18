const db = require('../../config/db');

const VendorPaymentService = require('./VendorPaymentService');

/**
 * Process Vendor Payment
 */
exports.processPayment = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await VendorPaymentService.processPayment({
            ...req.body,
            userId: req.user?.id
        }, client);
        await client.query('COMMIT');
        res.json({ success: true, ...result });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

/**
 * Get Vendor Payments
 */
exports.getPayments = async (req, res) => {
    try {
        const result = await VendorPaymentService.getPayments(req.query);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Vendor Outstanding Balance
 */
exports.getOutstanding = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM vendor_outstanding WHERE vendor_id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
        res.json(result.rows[0]);
    } catch (err) {
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
        let query = 'SELECT vl.*, s.name as vendor_name FROM vendor_ledger vl JOIN suppliers s ON vl.supplier_id = s.id WHERE vl.supplier_id = $1';
        const params = [id];
        if (startDate) { query += ' AND vl.date >= $2'; params.push(startDate); }
        if (endDate) { query += ' AND vl.date <= $3'; params.push(endDate); }
        query += ' ORDER BY vl.date DESC, vl.created_at DESC';
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get All Vendors with Outstanding Balances
 */
exports.getVendorsWithOutstanding = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM vendor_outstanding ORDER BY outstanding_balance DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Comprehensive Vendor Details
 */
exports.getVendorDetails = async (req, res) => {
    try {
        const vendor = await VendorPaymentService.getVendorDetails(req.params.id);
        res.json(vendor);
    } catch (err) {
        if (err.message === 'Vendor not found') return res.status(404).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get Vendor Categories
 */
exports.getCategories = async (req, res) => {
    try {
        const result = await VendorPaymentService.getCategories();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Get All Suppliers for Dropdown
 */
exports.getAllSuppliers = async (req, res) => {
    try {
        const result = await VendorPaymentService.getAllSuppliers();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = exports;
