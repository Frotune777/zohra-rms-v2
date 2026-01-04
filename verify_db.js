
const { Client } = require('pg');

async function testConnection(connectionString) {
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log(`Success: ${connectionString}`);
        console.log(res.rows[0]);
        await client.end();
        return true;
    } catch (err) {
        console.error(`Failed: ${connectionString} - ${err.message}`);
        await client.end();
        return false;
    }
}

async function main() {
    // Try .env.example credentials
    const url1 = 'postgresql://admin:password@localhost:5433/alzohra_db';
    // Try default postgres credentials
    const url2 = 'postgresql://postgres:postgres@localhost:5433/alzohra_db';
    // Try default postgres credentials with postgres db
    const url3 = 'postgresql://postgres:postgres@localhost:5433/postgres';

    if (await testConnection(url1)) process.exit(0);
    if (await testConnection(url2)) process.exit(0);
    if (await testConnection(url3)) process.exit(0);

    process.exit(1);
}

main();
