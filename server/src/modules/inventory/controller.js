const db = require('../../config/db');

// --- Helper: Rate Calculation Logic ---
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

// --- Inventory Item Controllers ---

exports.getInventory = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM inventory_items ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addInventory = async (req, res) => {
    const { name, stock_qty, unit, unit_cost } = req.body;

    if (!name || stock_qty === undefined || !unit || unit_cost === undefined) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const result = await db.query(
            'INSERT INTO inventory_items (name, stock_qty, unit, unit_cost) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, parseFloat(stock_qty), unit, parseFloat(unit_cost)]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Item name already exists' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
};

exports.updateInventory = async (req, res) => {
    const { id } = req.params;
    const { name, stock_qty, unit, unit_cost } = req.body;

    if (!name || stock_qty === undefined || !unit || unit_cost === undefined) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const result = await db.query(
            'UPDATE inventory_items SET name = $1, stock_qty = $2, unit = $3, unit_cost = $4 WHERE id = $5 RETURNING *',
            [name, parseFloat(stock_qty), unit, parseFloat(unit_cost), id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Item name already exists' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
};

exports.deleteInventory = async (req, res) => {
    const { id } = req.params;

    try {
        // Delete recipe ingredients first (foreign key constraint)
        await db.query('DELETE FROM recipe_ingredients WHERE inventory_item_id = $1', [id]);

        // Delete inventory item
        const result = await db.query('DELETE FROM inventory_items WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Chicken/Supplier Controllers ---

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
    try {
        const result = await db.query(
            `INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (date) DO UPDATE 
             SET tandoor_rate = EXCLUDED.tandoor_rate,
                 boiler_rate = EXCLUDED.boiler_rate,
                 egg_rate = EXCLUDED.egg_rate
             RETURNING *`,
            [date, tandoor_rate, boiler_rate, egg_rate]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getRateStatus = async (req, res) => {
    try {
        const result = await db.query('SELECT date FROM daily_rates ORDER BY date DESC LIMIT 10');
        res.json(result.rows);
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
    const { name, phone, payment_type, vendor_type, markup_required } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO suppliers (name, phone, payment_type, vendor_type, markup_required)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, phone, payment_type, vendor_type, markup_required]
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

exports.updateMarkupRule = async (req, res) => {
    const { id } = req.params;
    const { item_name, base_rate_type, op1, val1, op2, val2 } = req.body;

    try {
        const result = await db.query(
            `UPDATE markup_rules 
             SET item_name = $1, base_rate_type = $2, op1 = $3, val1 = $4, op2 = $5, val2 = $6, updated_at = NOW()
             WHERE id = $7
             RETURNING *`,
            [item_name, base_rate_type, op1, val1, op2 || null, val2 || null, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Markup rule not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteMarkupRule = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            'DELETE FROM markup_rules WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Markup rule not found' });
        }

        res.json({ success: true, message: 'Markup rule deleted successfully' });
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
            expected_rate = 0;
        }

        const variance = (parseFloat(vendor_rate) - expected_rate) * parseFloat(qty);

        // 4. Insert Bill Entry
        const result = await db.query(
            `INSERT INTO bill_entries (date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending') RETURNING *`,
            [date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance]
        );

        // 5. Add to Vendor Ledger
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

exports.getBillSummary = async (req, res) => {
    const { date, supplierId } = req.query;
    try {
        let query = `
            SELECT 
                COUNT(*) as total_entries,
                COALESCE(SUM(qty * vendor_rate), 0) as total_amount,
                COALESCE(SUM(qty * expected_rate), 0) as total_expected,
                COALESCE(SUM(variance), 0) as total_variance,
                COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count
            FROM bill_entries
            WHERE 1=1
        `;
        const params = [];
        let pIdx = 1;

        if (date) {
            query += ` AND date = $${pIdx++}`;
            params.push(date);
        }
        if (supplierId) {
            query += ` AND supplier_id = $${pIdx++}`;
            params.push(supplierId);
        }

        const result = await db.query(query, params);
        const data = result.rows[0];

        // Calculate percentage
        const totalAmount = parseFloat(data.total_amount);
        const totalVariance = parseFloat(data.total_variance);
        const variancePercentage = totalAmount > 0 ? ((totalVariance / totalAmount) * 100).toFixed(2) : 0;

        res.json({
            summary: {
                total_entries: parseInt(data.total_entries),
                total_amount: totalAmount,
                total_expected: parseFloat(data.total_expected),
                total_variance: totalVariance,
                variance_percentage: variancePercentage,
                approved_count: parseInt(data.approved_count),
                pending_count: parseInt(data.pending_count)
            }
        });
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
