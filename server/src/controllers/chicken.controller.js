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
