const db = require('./server/src/config/db');

const testEmployees = async () => {
    try {
        console.log('Testing getEmployees query...');
        const query = 'SELECT * FROM employees ORDER BY full_name';
        const res = await db.query(query);
        console.log(`Query successful. Rows: ${res.rows.length}`);
        if (res.rows.length > 0) {
            console.log('Sample row:', res.rows[0]);
        }
        process.exit(0);
    } catch (err) {
        console.error('Query failed:', err);
        process.exit(1);
    }
};

testEmployees();
