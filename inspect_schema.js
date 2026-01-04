
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5433/alzohra_db' });

async function inspect() {
    await client.connect();
    try {
        const res = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'daily_balances'`);
        console.log(`Indexes on daily_balances:`, res.rows);
    } catch (e) {
        console.error(e);
    }
    await client.end();
}
inspect();
