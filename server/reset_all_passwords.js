const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/alzohra_db'
});

async function resetAllPasswords() {
    try {
        // Reset owner password
        const ownerHash = await bcrypt.hash('owner123', 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [ownerHash, 'owner@alzohra.com']);
        console.log('✅ Password updated for owner@alzohra.com to owner123');

        // Reset manager password
        const managerHash = await bcrypt.hash('manager123', 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [managerHash, 'manager@alzohra.com']);
        console.log('✅ Password updated for manager@alzohra.com to manager123');

        // Reset staff password
        const staffHash = await bcrypt.hash('staff123', 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [staffHash, 'staff@alzohra.com']);
        console.log('✅ Password updated for staff@alzohra.com to staff123');

        pool.end();
    } catch (err) {
        console.error(err);
        pool.end();
    }
}

resetAllPasswords();
