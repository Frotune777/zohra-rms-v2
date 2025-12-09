const db = require('../config/db');

// --- Helper: Rate Calculation Logic (Ported from Python) ---
const calculateExpectedRate = (rawRates, rule) => {
    if (!rawRates || !rule) return 0.0;

    const { tandoor_rate, boiler_rate, egg_rate } = rawRates;
    const { base_rate_type, op1, val1, op2, val2 } = rule;

    let rate = 0.0;
    if (base_rate_type === 'TandoorRate') rate = parseFloat(tandoor_rate);
    else if (base_rate_type === 'BoilerRate') rate = parseFloat(boiler_rate);
    else if (base_rate_type === 'EggRate') rate = parseFloat(egg_rate);

    const applyOp = (currentVal, op, operand) => {
        if (operand === null || operand === undefined) return currentVal;
        const val = parseFloat(operand);
        if (op === '+') return currentVal + val;
        if (op === '-') return currentVal - val;
        if (op === '*') return currentVal * val;
        if (op === '/') return val !== 0 ? currentVal / val : currentVal;
        return currentVal;
    };

    rate = applyOp(rate, op1, val1);

    if (op2 && val2 !== null) {
        rate = applyOp(rate, op2, val2);
    }

    return Math.max(0.0, parseFloat(rate.toFixed(2)));
};

// --- Controllers ---

exports.getDailyRates = async (req, res) => {
    const { date } = req.query;
    try {
        const result = await db.query('SELECT * FROM daily_rates WHERE date = $1', [date]);
        res.json(result.rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveDailyRates = async (req, res) => {
    const { date, tandoor_rate, boiler_rate, egg_rate } = req.body;
    const userId = req.user?.id; // From auth middleware

    try {
        const result = await db.query(
            `INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate, status, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, 'confirmed', $5, CURRENT_TIMESTAMP)
             ON CONFLICT (date) DO UPDATE 
             SET tandoor_rate = EXCLUDED.tandoor_rate,
                 boiler_rate = EXCLUDED.boiler_rate,
                 egg_rate = EXCLUDED.egg_rate,
                 status = 'confirmed',
                 updated_by = EXCLUDED.updated_by,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [date, tandoor_rate, boiler_rate, egg_rate, userId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSuppliers = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM suppliers ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createSupplier = async (req, res) => {
    const { name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO suppliers (name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [name, phone, payment_type, vendor_type, markup_required, contact_person || null, email || null, address || null, gstin || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMarkupRules = async (req, res) => {
    const { supplierId } = req.query;
    try {
        const result = await db.query('SELECT * FROM markup_rules WHERE supplier_id = $1', [supplierId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveMarkupRule = async (req, res) => {
    const { supplier_id, item_name, base_rate_type, op1, val1, op2, val2 } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO markup_rules (supplier_id, item_name, base_rate_type, op1, val1, op2, val2)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (supplier_id, item_name) DO UPDATE
             SET base_rate_type = EXCLUDED.base_rate_type,
                 op1 = EXCLUDED.op1, val1 = EXCLUDED.val1,
                 op2 = EXCLUDED.op2, val2 = EXCLUDED.val2
             RETURNING *`,
            [supplier_id, item_name, base_rate_type, op1, val1, op2, val2]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createBillEntry = async (req, res) => {
    const { date, supplier_id, item_name, qty, vendor_rate } = req.body;

    try {
        // 1. Fetch Daily Rates
        const ratesRes = await db.query('SELECT * FROM daily_rates WHERE date = $1', [date]);
        if (ratesRes.rows.length === 0) {
            return res.status(400).json({ error: 'Daily rates not set for this date' });
        }
        const rawRates = ratesRes.rows[0];

        // 2. Fetch Markup Rule
        const ruleRes = await db.query(
            'SELECT * FROM markup_rules WHERE supplier_id = $1 AND item_name = $2',
            [supplier_id, item_name]
        );

        // 3. Calculate Expected Rate
        let expected_rate = 0;
        if (ruleRes.rows.length > 0) {
            expected_rate = calculateExpectedRate(rawRates, ruleRes.rows[0]);
        } else {
            // If no rule, assume vendor rate is correct or handle as error? 
            // For now, let's set expected to vendor rate if no rule exists (or 0)
            // But per requirements, we usually want to flag this. 
            // Let's default to 0 to show high variance if rule is missing.
            expected_rate = 0;
        }

        const variance = (parseFloat(vendor_rate) - expected_rate) * parseFloat(qty);

        // 4. Insert Bill Entry
        const result = await db.query(
            `INSERT INTO bill_entries (date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending') RETURNING *`,
            [date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance]
        );

        // 5. Add to Vendor Ledger (Bill creates a Liability/Payable)
        // Note: In this simple ledger, we track amount owed to vendor.
        // Bill increases amount owed.
        const billAmount = parseFloat(qty) * parseFloat(vendor_rate);
        await db.query(
            `INSERT INTO vendor_ledger (date, supplier_id, transaction_type, amount, details)
             VALUES ($1, $2, 'Bill', $3, $4)`,
            [date, supplier_id, billAmount, `Bill for ${item_name} (${qty} x ${vendor_rate})`]
        );

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBillEntries = async (req, res) => {
    const { date, supplierId } = req.query;
    let query = `
        SELECT b.*, s.name as supplier_name 
        FROM bill_entries b
        JOIN suppliers s ON b.supplier_id = s.id
        WHERE 1=1
    `;
    const params = [];
    let pIdx = 1;

    if (date) {
        query += ` AND b.date = $${pIdx++}`;
        params.push(date);
    }
    if (supplierId) {
        query += ` AND b.supplier_id = $${pIdx++}`;
        params.push(supplierId);
    }

    query += ' ORDER BY b.created_at DESC';

    try {
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getVendorLedger = async (req, res) => {
    const { supplierId } = req.query;
    try {
        const result = await db.query(
            'SELECT * FROM vendor_ledger WHERE supplier_id = $1 ORDER BY date DESC, created_at DESC',
            [supplierId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get rate status for a specific date
exports.getRateStatus = async (req, res) => {
    const { date } = req.query;
    try {
        const result = await db.query(
            `SELECT dr.*, u.full_name as updated_by_name 
             FROM daily_rates dr
             LEFT JOIN users u ON dr.updated_by = u.id
             WHERE dr.date = $1`,
            [date || new Date().toISOString().split('T')[0]]
        );

        if (result.rows.length === 0) {
            return res.json({ status: 'pending', exists: false });
        }

        res.json({ ...result.rows[0], exists: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update markup rule
exports.updateMarkupRule = async (req, res) => {
    const { id } = req.params;
    const { item_name, base_rate_type, op1, val1, op2, val2 } = req.body;
    const userId = req.user?.id;

    try {
        const result = await db.query(
            `UPDATE markup_rules 
             SET item_name = $1, base_rate_type = $2, op1 = $3, val1 = $4, 
                 op2 = $5, val2 = $6, updated_by = $7
             WHERE id = $8
             RETURNING *`,
            [item_name, base_rate_type, op1, val1, op2, val2, userId, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Markup rule not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Delete markup rule
exports.deleteMarkupRule = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            'DELETE FROM markup_rules WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Markup rule not found' });
        }

        res.json({ success: true, deleted: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get bill summary/totals
exports.getBillSummary = async (req, res) => {
    const { date, supplierId, startDate, endDate } = req.query;

    try {
        let query = `
            SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT supplier_id) as total_suppliers,
                SUM(qty * vendor_rate) as total_amount,
                SUM(qty * expected_rate) as total_expected,
                SUM(variance) as total_variance,
                AVG(variance) as avg_variance,
                SUM(CASE WHEN variance > 0 THEN 1 ELSE 0 END) as high_variance_count,
                SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count
            FROM bill_entries
            WHERE 1=1
        `;
        const params = [];
        let pIdx = 1;

        if (date) {
            query += ` AND date = $${pIdx++}`;
            params.push(date);
        } else if (startDate && endDate) {
            query += ` AND date BETWEEN $${pIdx++} AND $${pIdx++}`;
            params.push(startDate, endDate);
        }

        if (supplierId) {
            query += ` AND supplier_id = $${pIdx++}`;
            params.push(supplierId);
        }

        const summaryResult = await db.query(query, params);
        const summary = summaryResult.rows[0];

        // Get per-supplier breakdown
        let breakdownQuery = `
            SELECT 
                s.id as supplier_id,
                s.name as supplier_name,
                COUNT(*) as entry_count,
                SUM(b.qty * b.vendor_rate) as total_amount,
                SUM(b.variance) as total_variance
            FROM bill_entries b
            JOIN suppliers s ON b.supplier_id = s.id
            WHERE 1=1
        `;
        const breakdownParams = [];
        let bIdx = 1;

        if (date) {
            breakdownQuery += ` AND b.date = $${bIdx++}`;
            breakdownParams.push(date);
        } else if (startDate && endDate) {
            breakdownQuery += ` AND b.date BETWEEN $${bIdx++} AND $${bIdx++}`;
            breakdownParams.push(startDate, endDate);
        }

        if (supplierId) {
            breakdownQuery += ` AND b.supplier_id = $${bIdx++}`;
            breakdownParams.push(supplierId);
        }

        breakdownQuery += ` GROUP BY s.id, s.name ORDER BY total_amount DESC`;

        const breakdownResult = await db.query(breakdownQuery, breakdownParams);

        res.json({
            summary: {
                total_entries: parseInt(summary.total_entries),
                total_suppliers: parseInt(summary.total_suppliers),
                total_amount: parseFloat(summary.total_amount || 0),
                total_expected: parseFloat(summary.total_expected || 0),
                total_variance: parseFloat(summary.total_variance || 0),
                avg_variance: parseFloat(summary.avg_variance || 0),
                variance_percentage: summary.total_expected > 0
                    ? ((summary.total_variance / summary.total_expected) * 100).toFixed(2)
                    : 0,
                high_variance_count: parseInt(summary.high_variance_count),
                approved_count: parseInt(summary.approved_count),
                pending_count: parseInt(summary.pending_count)
            },
            breakdown: breakdownResult.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
