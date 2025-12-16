const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const MAPPING_FILE = path.join(__dirname, 'vendor_mapping.json');

async function applyNormalization() {
    if (!fs.existsSync(MAPPING_FILE)) {
        console.error('Mapping file not found!');
        return;
    }

    const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    const client = await pool.connect();

    try {
        console.log('Starting Vendor Normalization...');
        await client.query('BEGIN');

        // 1. Ensure all Target Vendors exist in 'suppliers' table
        const targets = new Set(Object.values(mapping));
        const targetIds = {}; // Name -> ID

        for (const vendorName of targets) {
            // Check if exists
            let res = await client.query('SELECT id FROM suppliers WHERE name = $1', [vendorName]);
            if (res.rows.length === 0) {
                // Create new vendor
                res = await client.query(
                    'INSERT INTO suppliers (name, vendor_type) VALUES ($1, $2) RETURNING id',
                    [vendorName, 'General']
                );
                console.log(`Created new vendor: ${vendorName}`);
            }
            targetIds[vendorName] = res.rows[0].id;
        }

        // 2. Update Transactions
        let updatedCount = 0;

        // We iterate through every raw variant in the mapping
        for (const [rawVariant, targetVendor] of Object.entries(mapping)) {
            const vendorId = targetIds[targetVendor];

            // Update transactions where description contains this raw variant in the specific format we imported
            // "Item (Vendor/Remark: rawVariant)"
            // PostgreSQL regex match helps here

            // Escape special chars for regex (parentheses, etc)
            const escapedVariant = rawVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            const res = await client.query(
                `UPDATE transactions 
                 SET vendor_id = $1
                 WHERE description LIKE '%(Vendor/Remark: ' || $2 || ')' 
                 AND vendor_id IS NULL`,
                [vendorId, rawVariant]
            );

            if (res.rowCount > 0) {
                // console.log(`Updated ${res.rowCount} records for variant "${rawVariant}" -> "${targetVendor}"`);
                updatedCount += res.rowCount;
            }
        }

        await client.query('COMMIT');
        console.log(`\nSuccess! Linked ${updatedCount} transactions to ${targets.size} normalized vendors.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

applyNormalization();
