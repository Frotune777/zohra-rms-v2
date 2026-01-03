const db = require('../src/config/db');

async function checkLink() {
    try {
        const res = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'employee_id'
        `);
        console.log('--- User-Employee Link Check ---');
        if (res.rows.length > 0) {
            console.log('✅ "employee_id" column exists in "users" table.');
        } else {
            console.log('❌ "employee_id" column MISSING in "users" table.');
        }

        const data = await db.query('SELECT id, full_name, employee_id FROM users LIMIT 5');
        console.table(data.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLink();
