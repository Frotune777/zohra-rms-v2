const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/alzohra_db'
});

async function checkDatabase() {
    console.log('🔍 Checking database connection...\n');

    try {
        // Test connection
        const client = await pool.connect();
        console.log('✓ Database connection successful');

        // Check if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log(`\n📊 Found ${tablesResult.rows.length} tables:`);
        tablesResult.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });

        // Check for required tables
        const requiredTables = [
            'users', 'employees', 'inventory_items', 'suppliers',
            'daily_rates', 'menu_items', 'chart_of_accounts'
        ];

        const existingTables = tablesResult.rows.map(r => r.table_name);
        const missingTables = requiredTables.filter(t => !existingTables.includes(t));

        if (missingTables.length > 0) {
            console.log(`\n⚠️  Missing tables: ${missingTables.join(', ')}`);
            console.log('   Run database migrations to create missing tables');
        } else {
            console.log('\n✓ All required tables exist');
        }

        client.release();
        process.exit(0);
    } catch (error) {
        console.error('✗ Database connection failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('  1. Make sure PostgreSQL is running');
        console.error('  2. Check DATABASE_URL in .env file');
        console.error('  3. Verify database credentials');
        process.exit(1);
    }
}

checkDatabase();
