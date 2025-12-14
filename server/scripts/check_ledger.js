const db = require('./server/src/config/db');

async function checkLedger() {
    try {
        const res = await db.query('SELECT * FROM advance_ledger ORDER BY created_at DESC LIMIT 10');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        // We can't easily close the pool if it's not exported with an end method, but the script will exit.
        process.exit();
    }
}

checkLedger();
