const fs = require('fs');
const db = require('../src/config/db');
const path = require('path');

async function runUpdates() {
    try {
        const migrations = [
            'migrations/037_owner_equity_tracking.sql'
        ];

        for (const file of migrations) {
            console.log(`Running ${file}...`);
            const sql = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
            await db.query(sql);
            console.log(`✅ ${file} applied.`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

runUpdates();
