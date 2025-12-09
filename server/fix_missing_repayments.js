require('dotenv').config();
const db = require('./src/config/db');

async function fixMissingRepayments() {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        console.log('=== FIXING MISSING REPAYMENT RECORDS ===\n');

        // Get all paid salary records with advance deductions that don't have repayment records
        const paidRecords = await client.query(`
            SELECT sh.*, e.full_name
            FROM salary_history sh
            JOIN employees e ON sh.employee_id = e.id
            WHERE sh.status = 'Paid' 
            AND sh.advance_deduction > 0
            ORDER BY sh.payment_date ASC
        `);

        console.log(`Found ${paidRecords.rows.length} paid payroll entries with advance deductions\n`);

        let fixed = 0;
        let skipped = 0;

        for (const record of paidRecords.rows) {
            // Check if repayment already exists
            const existingRepayment = await client.query(`
                SELECT id FROM advance_ledger
                WHERE employee_id = $1 
                AND transaction_type = 'Repayment'
                AND notes LIKE '%${record.month}/${record.year}%'
            `, [record.employee_id]);

            if (existingRepayment.rows.length > 0) {
                console.log(`  ✓ Skipping ${record.full_name} (${record.month}/${record.year}) - Repayment already exists`);
                skipped++;
                continue;
            }

            // Calculate balance
            const balRes = await client.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
                FROM advance_ledger 
                WHERE employee_id = $1
                AND transaction_date <= $2
            `, [record.employee_id, record.payment_date]);

            const currentBalance = parseFloat(balRes.rows[0].balance || 0);
            const deductionAmount = parseFloat(record.advance_deduction);
            const newBalance = currentBalance - deductionAmount;

            // Insert repayment record
            await client.query(`
                INSERT INTO advance_ledger 
                (employee_id, transaction_type, amount, balance_after, notes, payment_mode, paid_by, transaction_date)
                VALUES ($1, 'Repayment', $2, $3, $4, 'Payroll Deduction', 'System', $5)
            `, [
                record.employee_id,
                deductionAmount,
                newBalance,
                `Recovered from ${record.month}/${record.year} Payroll (Retroactive Fix)`,
                record.payment_date
            ]);

            console.log(`  ✅ Created repayment for ${record.full_name} (${record.month}/${record.year}): ₹${deductionAmount}`);
            console.log(`     Balance: ₹${currentBalance} → ₹${newBalance}`);
            fixed++;
        }

        await client.query('COMMIT');

        console.log(`\n=== SUMMARY ===`);
        console.log(`  Fixed: ${fixed} repayment records created`);
        console.log(`  Skipped: ${skipped} records (already had repayments)`);
        console.log(`\n✅ Done! Check the Advance Ledger page to verify.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error:', err.message);
        console.error(err.stack);
    } finally {
        client.release();
        process.exit();
    }
}

fixMissingRepayments();
