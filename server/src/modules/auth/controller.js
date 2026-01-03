const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`Login attempt for email: ${email}`);

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Find user
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            console.log(`Login failed: User not found for email ${email}`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            // For demo purposes, allow known passwords
            const demoPasswords = {
                'owner123': 'owner@alzohra.com',
                'manager123': 'manager@alzohra.com',
                'staff123': 'staff@alzohra.com'
            };

            if (demoPasswords[password] !== email) {
                console.log(`Login failed: Password mismatch for email ${email}`);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        }

        // Generate JWT token
        console.log(`Login successful for user: ${user.email} (${user.role})`);
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (err) {
        console.error('CRITICAL: Login error caught in controller:', err);
        res.status(500).json({
            error: err.message || 'Unknown Authentication Error',
            details: err.toString(),
            stack: err.stack
        });
    }
};

// Register new user (only by owner/manager)
const register = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { email, password, full_name, role } = req.body;

        if (!email || !password || !full_name || !role) {
            return res.status(400).json({ error: 'All fields required' });
        }

        await client.query('BEGIN');

        // Check if user exists
        const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // --- ACCOUNTING INTEGRATION ---
        // 1. Find next available Ledger Code for Employees (Range 1051+)
        // We'll search for the highest code in the 1xxx range that is >= 1051
        const codeRes = await client.query('SELECT MAX(code) as max_code FROM chart_of_accounts WHERE code >= 1051 AND code < 2000');
        let nextCode = (codeRes.rows[0].max_code || 1050) + 1;

        // 2. Create Ledger Account
        await client.query(
            "INSERT INTO chart_of_accounts (code, name, type) VALUES ($1, $2, 'Asset')",
            [nextCode, `Wallet - ${full_name}`]
        );

        // 3. Create user with ledger link
        const result = await client.query(
            'INSERT INTO users (email, password_hash, full_name, role, ledger_account_code) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role, ledger_account_code',
            [email, password_hash, full_name, role, nextCode]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Register error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// Get current user info
const getCurrentUser = async (req, res) => {
    try {
        const result = await db.query('SELECT id, email, full_name, role FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('GetCurrentUser error:', err);
        res.status(500).json({ error: err.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const result = await db.query('SELECT id, full_name, email, role, ledger_account_code FROM users ORDER BY full_name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { login, register, getCurrentUser, getUsers };
