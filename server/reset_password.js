const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/alzohra_db'
});

async function resetPassword() {
    try {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashedPassword, 'owner@alzohra.com']);
        console.log('Password updated for owner@alzohra.com to password123');
        pool.end();
    } catch (err) {
        console.error(err);
        pool.end();
    }
}

resetPassword();
