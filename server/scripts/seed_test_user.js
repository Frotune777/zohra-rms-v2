const db = require('../src/config/db');
const bcrypt = require('bcryptjs');

async function seedUser() {
    try {
        const email = 'admin@alzohra.com';
        const password = 'password123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Check if exists
        const check = await db.query("SELECT id FROM users WHERE email = $1", [email]);

        if (check.rows.length > 0) {
            await db.query("UPDATE users SET password_hash = $1, role = 'owner', full_name = 'Test Admin' WHERE email = $2", [hash, email]);
            console.log(`Updated user ${email} with password ${password}`);
        } else {
            await db.query(`
                INSERT INTO users (full_name, email, password_hash, role)
                VALUES ('Test Admin', $1, $2, 'owner')
            `, [email, hash]);
            console.log(`Created user ${email} with password ${password}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seedUser();
