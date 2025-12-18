#!/usr/bin/env node

/**
 * Deployment Script for Accounting System Refactor Migrations
 * 
 * This script runs the SQL migrations in the correct order:
 * 1. payment_modes - Configuration table
 * 2. category_account_mapping - Link categories to GL accounts
 * 3. daily_closure_enforcement - Day locking infrastructure
 * 4. period_locking - Financial period controls
 * 
 * Usage: node deploy_accounting_migrations.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

const MIGRATIONS = [
    '030_payment_modes.sql',
    '031_category_account_mapping.sql',
    '032_daily_closure_enforcement.sql',
    '033_period_locking.sql'
];

async function runMigration(filename) {
    const filepath = path.join(__dirname, 'server', 'migrations', filename);

    console.log(`\n📄 Running migration: ${filename}`);

    if (!fs.existsSync(filepath)) {
        throw new Error(`Migration file not found: ${filepath}`);
    }

    const sql = fs.readFileSync(filepath, 'utf8');

    try {
        await pool.query(sql);
        console.log(`✅ Successfully ran: ${filename}`);
    } catch (err) {
        console.error(`❌ Failed to run ${filename}:`, err.message);
        throw err;
    }
}

async function main() {
    console.log('🚀 Starting Accounting System Refactor Migrations...\n');
    console.log('This will:');
    console.log('  1. Create payment_modes configuration table');
    console.log('  2. Link expense categories to GL accounts');
    console.log('  3. Add daily closure enforcement infrastructure');
    console.log('  4. Setup financial period locking');
    console.log('\n' + '='.repeat(60) + '\n');

    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful\n');

        // Run migrations in order
        for (const migration of MIGRATIONS) {
            await runMigration(migration);
        }

        console.log('\n' + '='.repeat(60));
        console.log('\n✅ All migrations completed successfully!');
        console.log('\n🎯 Next Steps:');
        console.log('   1. Restart your server to load new services');
        console.log('   2. Test expense entry with new validation');
        console.log('   3. Test daily closure functionality');
        console.log('   4. Verify payment modes API');

    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        console.error('\nStack trace:', err.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
