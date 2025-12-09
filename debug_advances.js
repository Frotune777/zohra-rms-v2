const db = require('./server/src/config/db');

const testQuery = async () => {
    try {
        console.log('Testing getAllAdvances query...');
        const query = `
            SELECT al.*, e.full_name as employee_name
            FROM advance_ledger al
            JOIN employees e ON al.employee_id = e.id
            ORDER BY al.transaction_date DESC
        `;
        const res = await db.query(query);
        console.log(`Query successful. Rows: ${res.rows.length}`);
        console.log('Sample row:', res.rows[0]);
        process.exit(0);
    } catch (err) {
        console.error('Query failed:', err);
        process.exit(1);
    }
};

testQuery();
