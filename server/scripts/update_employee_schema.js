require('dotenv').config({ path: './server/.env' });
const db = require('../src/config/db');

const updateSchema = async () => {
    try {
        console.log('Adding new columns to employees table...');

        await db.query(`
            ALTER TABLE employees 
            ADD COLUMN IF NOT EXISTS employee_code VARCHAR(20) UNIQUE,
            ADD COLUMN IF NOT EXISTS govt_id_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS govt_id_number VARCHAR(50);
        `);

        console.log('Columns added successfully.');

        // Optional: Backfill employee_code for existing employees
        console.log('Backfilling employee_code for existing employees...');
        const res = await db.query('SELECT id FROM employees WHERE employee_code IS NULL ORDER BY id');
        for (const row of res.rows) {
            const code = `EMP${String(row.id).padStart(3, '0')}`;
            await db.query('UPDATE employees SET employee_code = $1 WHERE id = $2', [code, row.id]);
        }
        console.log('Backfill complete.');

        process.exit(0);
    } catch (err) {
        console.error('Error updating schema:', err);
        process.exit(1);
    }
};

updateSchema();
