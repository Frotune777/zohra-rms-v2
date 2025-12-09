const { Pool } = require('pg');

// Load environment variables from server/.env manually
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'server', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
        envVars[key.trim()] = valueParts.join('=').trim();
    }
});

const pool = new Pool({
    connectionString: envVars.DATABASE_URL
});

async function diagnoseAdvanceLedger() {
    try {
        console.log('=== ADVANCE LEDGER DIAGNOSTIC ===\n');

        // 1. Check advance_ledger for Repayment records
        console.log('1. Checking for Repayment records in advance_ledger:');
        const repayments = await pool.query(`
            SELECT id, employee_id, transaction_type, amount, balance_after, 
                   transaction_date, notes, payment_mode, paid_by
            FROM advance_ledger 
            WHERE transaction_type = 'Repayment'
            ORDER BY created_at DESC
            LIMIT 10
        `);
        console.log(`   Found ${repayments.rows.length} repayment records`);
        if (repayments.rows.length > 0) {
            console.log('   Sample repayments:', JSON.stringify(repayments.rows, null, 2));
        }
        console.log('');

        // 2. Check all advance_ledger records
        console.log('2. All advance_ledger records (last 10):');
        const allRecords = await pool.query(`
            SELECT al.*, e.full_name 
            FROM advance_ledger al
            LEFT JOIN employees e ON al.employee_id = e.id
            ORDER BY al.created_at DESC
            LIMIT 10
        `);
        console.log(`   Total records: ${allRecords.rows.length}`);
        allRecords.rows.forEach(r => {
            console.log(`   - ${r.transaction_date?.toISOString().split('T')[0]} | ${r.full_name} | ${r.transaction_type} | ₹${r.amount} | Balance: ₹${r.balance_after}`);
        });
        console.log('');

        // 3. Check salary_history for entries with advance_deduction
        console.log('3. Salary history entries with advance deductions:');
        const payrollWithDeductions = await pool.query(`
            SELECT sh.id, sh.employee_id, e.full_name, sh.month, sh.year, 
                   sh.advance_deduction, sh.status, sh.payment_date, sh.paid_by
            FROM salary_history sh
            JOIN employees e ON sh.employee_id = e.id
            WHERE sh.advance_deduction > 0
            ORDER BY sh.processed_at DESC
            LIMIT 10
        `);
        console.log(`   Found ${payrollWithDeductions.rows.length} payroll entries with deductions`);
        payrollWithDeductions.rows.forEach(p => {
            console.log(`   - ${p.full_name} | ${p.month}/${p.year} | Deduction: ₹${p.advance_deduction} | Status: ${p.status} | Paid: ${p.payment_date ? 'Yes' : 'No'}`);
        });
        console.log('');

        // 4. Check totals
        console.log('4. Advance Ledger Totals:');
        const totals = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) as total_advances,
                COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as total_repayments
            FROM advance_ledger
        `);
        const { total_advances, total_repayments } = totals.rows[0];
        const outstanding = parseFloat(total_advances) - parseFloat(total_repayments);
        console.log(`   Total Advances: ₹${parseFloat(total_advances).toFixed(2)}`);
        console.log(`   Total Repayments: ₹${parseFloat(total_repayments).toFixed(2)}`);
        console.log(`   Outstanding Balance: ₹${outstanding.toFixed(2)}`);
        console.log('');

        // 5. Diagnosis
        console.log('=== DIAGNOSIS ===');
        if (repayments.rows.length === 0 && payrollWithDeductions.rows.length > 0) {
            const unpaidCount = payrollWithDeductions.rows.filter(p => p.status !== 'Paid').length;
            if (unpaidCount > 0) {
                console.log(`⚠️  ISSUE FOUND: ${unpaidCount} payroll entries have advance deductions but are not marked as "Paid"`);
                console.log('   ACTION REQUIRED: Go to Payroll page, approve these entries, then click "Mark as Paid"');
            } else {
                console.log('⚠️  ISSUE FOUND: Payroll entries are marked as Paid but no Repayment records exist');
                console.log('   This indicates a bug in the markPaid function');
            }
        } else if (repayments.rows.length > 0) {
            console.log('✅ Repayment records exist in the database');
            console.log('   If they are not showing in the UI, there may be a frontend query issue');
        } else {
            console.log('ℹ️  No payroll entries with advance deductions found');
            console.log('   Advances may not have been deducted from any payroll yet');
        }

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    } finally {
        await pool.end();
        process.exit();
    }
}

diagnoseAdvanceLedger();
