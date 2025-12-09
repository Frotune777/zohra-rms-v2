const db = require('./server/src/config/db');

const updateSchema = async () => {
    try {
        console.log('Adding new columns to advance_ledger table...');

        await db.query(`
            ALTER TABLE advance_ledger 
            ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash',
            ADD COLUMN IF NOT EXISTS paid_by VARCHAR(100);
        `);

        console.log('Columns added successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error updating schema:', err);
        process.exit(1);
    }
};

updateSchema();
